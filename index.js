const traverse = obj => new Traverse(obj);


class Traverse {
    constructor(obj) {
        this.value = obj;
    }

    get(ps) {
        let node = this.value;

        for (const key of ps) {
            if (!node || !hasOwnProperty.call(node, key)) {
                node = undefined;
                break;
            }
            node = node[key];
        }

        return node;
    }

    has(ps) {
        let node = this.value;

        for (const key of ps) {
            if (!node || !hasOwnProperty.call(node, key)) {
                return false;
            }
            node = node[key];
        }

        return true;
    }

    set(ps, value) {
        let node = this.value;
        for (let i = 0; i < ps.length - 1; i ++) {
            const key = ps[i];
            if (!hasOwnProperty.call(node, key)) node[key] = {};
            node = node[key];
        }
        node[ps[i]] = value;
        return value;
    }

    map(cb) {
        return walk(this.value, cb, true);
    }

    forEach(cb) {
        this.value = walk(this.value, cb, false);
        return this.value;
    }

    reduce(cb, init) {
        const skip = arguments.length === 1;
        let acc = skip ? this.value : init;
        this.forEach(function (x) {
            if (!this.isRoot || !skip) {
                acc = cb.call(this, acc, x);
            }
        });
        return acc;
    }

    paths() {
        const acc = [];
        this.forEach(function (x) {
            acc.push(this.path);
        });
        return acc;
    }

    nodes() {
        const acc = [];
        this.forEach(function (x) {
            acc.push(this.node);
        });
        return acc;
    }

    clone() {
        const parents = [];
        const nodes = [];

        return (function clone (src) {
            for (let i = 0; i < parents.length; i++) {
                if (parents[i] === src) {
                    return nodes[i];
                }
            }

            if (typeof src === 'object' && src !== null) {
                const dst = copy(src);

                parents.push(src);
                nodes.push(dst);

                forEach(objectKeys(src), key => {
                    dst[key] = clone(src[key]);
                });

                parents.pop();
                nodes.pop();
                return dst;
            }
            else {
                return src;
            }
        })(this.value);
    }
}

function walk (root, cb, immutable) {
    const path = [];
    const parents = [];
    let alive = true;

    return (function walker (node_) {
        const node = immutable ? copy(node_) : node_;
        const modifiers = {};

        let keepGoing = true;

        const state = {
            node,
            node_,
            path : [].concat(path),
            parent : parents[parents.length - 1],
            parents,
            key : path.slice(-1)[0],
            isRoot : path.length === 0,
            level : path.length,
            circular : null,
            update(x, stopHere) {
                if (!state.isRoot) {
                    state.parent.node[state.key] = x;
                }
                state.node = x;
                if (stopHere) keepGoing = false;
            },
            'delete'(stopHere) {
                delete state.parent.node[state.key];
                if (stopHere) keepGoing = false;
            },
            remove(stopHere) {
                if (isArray(state.parent.node)) {
                    state.parent.node.splice(state.key, 1);
                }
                else {
                    delete state.parent.node[state.key];
                }
                if (stopHere) keepGoing = false;
            },
            keys : null,
            before(f) { modifiers.before = f },
            after(f) { modifiers.after = f },
            pre(f) { modifiers.pre = f },
            post(f) { modifiers.post = f },
            stop() { alive = false },
            block() { keepGoing = false }
        };

        if (!alive) return state;

        function updateState() {
            if (typeof state.node === 'object' && state.node !== null) {
                if (!state.keys || state.node_ !== state.node) {
                    state.keys = objectKeys(state.node)
                }

                state.isLeaf = state.keys.length == 0;

                for (let i = 0; i < parents.length; i++) {
                    if (parents[i].node_ === node_) {
                        state.circular = parents[i];
                        break;
                    }
                }
            }
            else {
                state.isLeaf = true;
                state.keys = null;
            }

            state.notLeaf = !state.isLeaf;
            state.notRoot = !state.isRoot;
        }

        updateState();

        // use return values to update if defined
        const ret = cb.call(state, state.node);
        if (ret !== undefined && state.update) state.update(ret);

        if (modifiers.before) modifiers.before.call(state, state.node);

        if (!keepGoing) return state;

        if (typeof state.node == 'object'
        && state.node !== null && !state.circular) {
            parents.push(state);

            updateState();

            forEach(state.keys, (key, i) => {
                path.push(key);

                if (modifiers.pre) modifiers.pre.call(state, state.node[key], key);

                const child = walker(state.node[key]);
                if (immutable && hasOwnProperty.call(state.node, key)) {
                    state.node[key] = child.node;
                }

                child.isLast = i == state.keys.length - 1;
                child.isFirst = i == 0;

                if (modifiers.post) modifiers.post.call(state, child);

                path.pop();
            });
            parents.pop();
        }

        if (modifiers.after) modifiers.after.call(state, state.node);

        return state;
    })(root).node;
}

function copy (src) {
    if (typeof src === 'object' && src !== null) {
        let dst;

        if (isArray(src)) {
            dst = [];
        }
        else if (isDate(src)) {
            dst = new Date(src.getTime ? src.getTime() : src);
        }
        else if (isRegExp(src)) {
            dst = new RegExp(src);
        }
        else if (isError(src)) {
            dst = { message: src.message };
        }
        else if (isBoolean(src)) {
            dst = new Boolean(src);
        }
        else if (isNumber(src)) {
            dst = new Number(src);
        }
        else if (isString(src)) {
            dst = new String(src);
        }
        else if (Object.create && Object.getPrototypeOf) {
            dst = Object.create(Object.getPrototypeOf(src));
        }
        else if (src.constructor === Object) {
            dst = {};
        }
        else {
            const proto =
                (src.constructor && src.constructor.prototype)
                || src.__proto__
                || {};
            const T = () => {};
            T.prototype = proto;
            dst = new T;
        }

        forEach(objectKeys(src), key => {
            dst[key] = src[key];
        });
        return dst;
    }
    else return src;
}

var objectKeys = Object.keys || function keys (obj) {
    const res = [];
    for (const key in obj) res.push(key)
    return res;
};

function toS (obj) { return Object.prototype.toString.call(obj) }
function isDate (obj) { return toS(obj) === '[object Date]' }
function isRegExp (obj) { return toS(obj) === '[object RegExp]' }
function isError (obj) { return toS(obj) === '[object Error]' }
function isBoolean (obj) { return toS(obj) === '[object Boolean]' }
function isNumber (obj) { return toS(obj) === '[object Number]' }
function isString (obj) { return toS(obj) === '[object String]' }

var isArray = Array.isArray || function isArray (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var forEach = (xs, fn) => {
    if (xs.forEach) return xs.forEach(fn)
    else for (let i = 0; i < xs.length; i++) {
        fn(xs[i], i, xs);
    }
};


let [,...objKeys] = Object.getOwnPropertyNames( Traverse.prototype );
forEach(objKeys, key => {
    traverse[key] = function (obj, ...args) {
        const t = new Traverse(obj);
        return t[key](...args);
    };
});

var hasOwnProperty = Object.hasOwnProperty || ((obj, key) => key in obj);

export default traverse;
