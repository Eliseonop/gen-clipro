//#region \0rolldown/runtime.js
var e = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports);
//#endregion
//#region node_modules/mediabunny/dist/modules/src/misc.js
function t(e) {
	if (!e) throw Error("Assertion failed.");
}
var n = (e) => {
	let t = (e % 360 + 360) % 360;
	if (t === 0 || t === 90 || t === 180 || t === 270) return t;
	throw Error(`Invalid rotation ${e}.`);
}, r = (e) => e && e[e.length - 1], i = (e) => {
	let t = 0;
	for (; e.readBits(1) === 0 && t < 32;) t++;
	if (t >= 32) throw Error("Invalid exponential-Golomb code.");
	return (1 << t) - 1 + e.readBits(t);
}, a = (e) => {
	let t = i(e);
	return t & 1 ? t + 1 >> 1 : -(t >> 1);
}, o = (e, t, n, r) => {
	for (let i = t; i < n; i++) {
		let t = Math.floor(i / 8), a = e[t], o = 7 - (i & 7);
		a &= ~(1 << o), a |= (r & 1 << n - i - 1) >> n - i - 1 << o, e[t] = a;
	}
}, s = (e) => e.constructor === Uint8Array ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength) : new Uint8Array(e), c = (e) => e.constructor === DataView ? e : ArrayBuffer.isView(e) ? new DataView(e.buffer, e.byteOffset, e.byteLength) : new DataView(e), l = /* #__PURE__ */ new TextDecoder(), u = /* #__PURE__ */ new TextEncoder(), d = (e) => Object.fromEntries(Object.entries(e).map(([e, t]) => [t, e])), f = {
	bt709: 1,
	bt470bg: 5,
	smpte170m: 6,
	bt2020: 9,
	smpte432: 12
}, p = /* #__PURE__ */ d(f), m = {
	bt709: 1,
	smpte170m: 6,
	linear: 8,
	"iec61966-2-1": 13,
	pq: 16,
	hlg: 18
}, h = /* #__PURE__ */ d(m), g = {
	rgb: 0,
	bt709: 1,
	bt470bg: 5,
	smpte170m: 6,
	"bt2020-ncl": 9
}, _ = /* #__PURE__ */ d(g), v = (e) => !!e && !!e.primaries && !!e.transfer && !!e.matrix && e.fullRange !== void 0, y = (e) => !e || e.primaries == null && e.transfer == null && e.matrix == null && e.fullRange == null, b = {
	primaries: void 0,
	transfer: void 0,
	matrix: void 0,
	fullRange: void 0
}, x = (e) => e instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && e instanceof SharedArrayBuffer || ArrayBuffer.isView(e), S = class {
	constructor() {
		this.currentPromise = Promise.resolve(), this.pending = 0;
	}
	async acquire() {
		let e, t = new Promise((t) => {
			let n = !1;
			e = () => {
				n ||= (t(), this.pending--, !0);
			};
		}), n = this.currentPromise;
		return this.currentPromise = t, this.pending++, await n, e;
	}
}, C = /^[0-9a-fA-F]+$/, w = (e) => [...e].map((e) => e.toString(16).padStart(2, "0")).join(""), T = (e) => {
	t(e.length % 2 == 0);
	let n = new Uint8Array(e.length / 2);
	for (let t = 0; t < e.length; t += 2) n[t / 2] = parseInt(e.slice(t, t + 2), 16);
	return n;
}, E = (e) => (e = e >> 1 & 1431655765 | (e & 1431655765) << 1, e = e >> 2 & 858993459 | (e & 858993459) << 2, e = e >> 4 & 252645135 | (e & 252645135) << 4, e = e >> 8 & 16711935 | (e & 16711935) << 8, e = e >> 16 & 65535 | (e & 65535) << 16, e >>> 0), D = (e, t, n) => {
	let r = 0, i = e.length - 1, a = -1;
	for (; r <= i;) {
		let o = r + i >> 1, s = n(e[o]);
		s === t ? (a = o, i = o - 1) : s < t ? r = o + 1 : i = o - 1;
	}
	return a;
}, O = (e, t, n) => {
	let r = 0, i = e.length - 1, a = -1;
	for (; r <= i;) {
		let o = r + (i - r + 1) / 2 | 0;
		n(e[o]) <= t ? (a = o, r = o + 1) : i = o - 1;
	}
	return a;
}, ee = (e, t, n) => {
	let r = O(e, n(t), n);
	e.splice(r + 1, 0, t);
}, k = () => {
	let e, t;
	return {
		promise: new Promise((n, r) => {
			e = n, t = r;
		}),
		resolve: e,
		reject: t
	};
}, te = (e, t) => {
	let n = e.indexOf(t);
	n !== -1 && e.splice(n, 1);
}, ne = (e, t) => {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return e[n];
}, re = (e, t) => {
	for (let n = e.length - 1; n >= 0; n--) if (t(e[n])) return n;
	return -1;
}, ie = async function* (e) {
	Symbol.iterator in e ? yield* e[Symbol.iterator]() : yield* e[Symbol.asyncIterator]();
}, ae = (e) => {
	if (!(Symbol.iterator in e) && !(Symbol.asyncIterator in e)) throw TypeError("Argument must be an iterable or async iterable.");
}, oe = (e) => {
	throw Error(`Unexpected value: ${e}`);
}, se = (e, t, n) => {
	let r = e.getUint8(t), i = e.getUint8(t + 1), a = e.getUint8(t + 2);
	return n ? r | i << 8 | a << 16 : r << 16 | i << 8 | a;
}, ce = (e, t, n, r) => {
	n >>>= 0, n &= 16777215, r ? (e.setUint8(t, n & 255), e.setUint8(t + 1, n >>> 8 & 255), e.setUint8(t + 2, n >>> 16 & 255)) : (e.setUint8(t, n >>> 16 & 255), e.setUint8(t + 1, n >>> 8 & 255), e.setUint8(t + 2, n & 255));
}, le = (e, t, n) => Math.max(t, Math.min(n, e)), ue = (e, t, n) => e + (t - e) * n, de = (e) => {
	let t = Math.round(e);
	return Math.abs(e / t - 1) < 10 * 2 ** -52 ? t : e;
}, fe = (e, t) => Math.round(e / t) * t, pe = (e, t) => Math.round(e * t) / t, me = (e, t) => Math.floor(e / t) * t, he = (e, t) => Math.floor(e * t) / t, ge = (e) => {
	let t = 0;
	for (; e;) t++, e >>= 1;
	return t;
}, _e = (e) => {
	let t = 0;
	for (; e !== 0;) e &= e - 1, t++;
	return t;
}, ve = /^[a-z]{3}$/, ye = (e) => ve.test(e), be = 1e6 * (1 + 2 ** -52), xe = (e, t) => {
	let n = {
		...e,
		...t
	};
	if (e.headers || t.headers) {
		let r = e.headers ? Se(e.headers) : {}, i = t.headers ? Se(t.headers) : {}, a = { ...r };
		Object.entries(i).forEach(([e, t]) => {
			let n = Object.keys(a).find((t) => t.toLowerCase() === e.toLowerCase());
			n && delete a[n], a[e] = t;
		}), n.headers = a;
	}
	return n;
}, Se = (e) => {
	if (e instanceof Headers) {
		let t = {};
		return e.forEach((e, n) => {
			t[n] = e;
		}), t;
	}
	if (Array.isArray(e)) {
		let t = {};
		return e.forEach(([e, n]) => {
			t[e] = n;
		}), t;
	}
	return e;
}, Ce = async (e, t, n, r, i) => {
	let a = 0;
	for (;;) try {
		return await e(t, n);
	} catch (e) {
		if (i()) throw e;
		a++;
		let n = r(a, e, t);
		if (n === null) throw e;
		if (j._error("Retrying failed fetch. Error:", e), !Number.isFinite(n) || n < 0) throw TypeError("Retry delay must be a non-negative finite number.");
		if (n > 0 && await Ke(1e3 * n), i()) throw e;
	}
}, we = class {
	constructor() {
		this.currentPromise = Promise.resolve();
	}
	call(e) {
		return this.currentPromise = this.currentPromise.then(e);
	}
}, Te = null, Ee = () => Te === null ? Te = !!(typeof navigator < "u" && (navigator.vendor?.match(/apple/i) || /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) || /\b(iPad|iPhone|iPod)\b/.test(navigator.userAgent))) : Te, De = null, Oe = () => De === null ? De = typeof navigator < "u" && navigator.userAgent?.includes("Firefox") : De, ke = null, Ae = () => ke === null ? ke = !!(typeof navigator < "u" && (navigator.vendor?.includes("Google Inc") || /Chrome/.test(navigator.userAgent))) : ke, je = (e) => globalThis.isSecureContext !== void 0 && !globalThis.isSecureContext ? `${e} is not available in this environment; this may be because this page is running in an insecure context. Try serving your page over HTTPS or use localhost.` : `${e} is not available in this environment.`, Me = (/* #__PURE__ */ (async () => {})()).constructor, A = (e) => e instanceof Me || e instanceof Promise || typeof e?.then == "function", Ne = (e, t) => e === -1 ? t : e, Pe = (e, t, n, r) => e <= r && n <= t, Fe = function* (e) {
	for (let t in e) {
		let n = e[t];
		n !== void 0 && (yield {
			key: t,
			value: n
		});
	}
}, Ie = (e) => {
	switch (e.toLowerCase()) {
		case "image/jpeg":
		case "image/jpg": return ".jpg";
		case "image/png": return ".png";
		case "image/gif": return ".gif";
		case "image/webp": return ".webp";
		case "image/bmp": return ".bmp";
		case "image/svg+xml": return ".svg";
		case "image/tiff": return ".tiff";
		case "image/avif": return ".avif";
		case "image/x-icon":
		case "image/vnd.microsoft.icon": return ".ico";
		default: return null;
	}
}, Le = (e) => {
	let t = atob(e), n = new Uint8Array(t.length);
	for (let e = 0; e < t.length; e++) n[e] = t.charCodeAt(e);
	return n;
}, Re = (e, t) => {
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
	return !0;
}, ze = () => {
	Symbol.dispose ??= Symbol("Symbol.dispose");
}, Be = (e) => typeof e == "number" && !Number.isNaN(e), Ve = (e, t) => {
	if (t.includes("://")) return t;
	if (e.includes("://")) {
		let t = e.indexOf("?");
		t !== -1 && (e = e.slice(0, t));
	}
	let n;
	if (t.startsWith("/")) {
		let r = e.indexOf("://");
		if (r === -1) n = t;
		else {
			let i = e.indexOf("/", r + 3);
			n = i === -1 ? e + t : e.slice(0, i) + t;
		}
	} else {
		let r = e.lastIndexOf("/");
		n = r === -1 ? t : e.slice(0, r + 1) + t;
	}
	let r = "", i = n.indexOf("://");
	if (i !== -1) {
		let e = n.indexOf("/", i + 3);
		e !== -1 && (r = n.slice(0, e), n = n.slice(e));
	}
	let a = n.split("/"), o = [];
	for (let e of a) e === ".." ? o.pop() : e !== "." && o.push(e);
	return r + o.join("/");
}, He = (e, t) => {
	let n = 0;
	for (let r = 0; r < e.length; r++) t(e[r]) && n++;
	return n;
}, Ue = (e, t) => {
	let n = -1, r = Infinity;
	for (let i = 0; i < e.length; i++) {
		let a = t(e[i]);
		a < r && (r = a, n = i);
	}
	return n;
}, We = (e) => {
	t(Number.isInteger(e.num)), t(Number.isInteger(e.den)), t(e.den !== 0);
	let n = Math.abs(e.num), r = Math.abs(e.den);
	for (; r !== 0;) {
		let e = n % r;
		n = r, r = e;
	}
	let i = n || 1;
	return {
		num: e.num / i,
		den: e.den / i
	};
}, Ge = (e, t) => {
	if (typeof e != "object" || !e) throw TypeError(`${t} must be an object.`);
	if (!Number.isInteger(e.left) || e.left < 0) throw TypeError(`${t}.left must be a non-negative integer.`);
	if (!Number.isInteger(e.top) || e.top < 0) throw TypeError(`${t}.top must be a non-negative integer.`);
	if (!Number.isInteger(e.width) || e.width < 0) throw TypeError(`${t}.width must be a non-negative integer.`);
	if (!Number.isInteger(e.height) || e.height < 0) throw TypeError(`${t}.height must be a non-negative integer.`);
}, Ke = (e) => new Promise((t) => setTimeout(t, e)), qe = (e) => Array.isArray(e) ? e : [e], Je = class {
	constructor() {
		this._listeners = /* @__PURE__ */ new Map();
	}
	on(e, t, n) {
		this._listeners.has(e) || this._listeners.set(e, /* @__PURE__ */ new Set());
		let r = {
			fn: t,
			once: n?.once ?? !1
		};
		return this._listeners.get(e).add(r), () => {
			this._listeners.get(e)?.delete(r);
		};
	}
	_emit(...e) {
		let [t, n] = e, r = this._listeners.get(t);
		if (r) for (let e of r) {
			try {
				e.fn(n);
			} catch (e) {
				console.error(e);
			}
			e.once && r.delete(e);
		}
	}
}, Ye = (e) => typeof e == "object" && !!e && Object.getPrototypeOf(e) === Object.prototype && Object.values(e).every((e) => typeof e == "string"), Xe;
(function(e) {
	e[e.Silent = 0] = "Silent", e[e.Errors = 1] = "Errors", e[e.Warnings = 2] = "Warnings", e[e.Info = 3] = "Info";
})(Xe ||= {});
var j = class e {
	constructor() {}
	static get level() {
		return e._level;
	}
	static set level(t) {
		if (t !== Xe.Silent && t !== Xe.Errors && t !== Xe.Warnings && t !== Xe.Info) throw TypeError("Invalid log level. Use one of the values of the LogLevel enum.");
		e._level = t;
	}
	static get _emitter() {
		return e._emitterInstance ??= new Je();
	}
	static on(t, n, r) {
		return e._emitter.on(t, n, r);
	}
	static _error(...t) {
		e._emitter._emit("error", t), e._level >= Xe.Errors && console.error(...t);
	}
	static _warn(...t) {
		e._emitter._emit("warn", t), e._level >= Xe.Warnings && console.warn(...t);
	}
	static _info(...t) {
		e._emitter._emit("info", t), e._level >= Xe.Info && console.info(...t);
	}
};
j._level = Xe.Info, j._emitterInstance = null;
//#endregion
//#region node_modules/mediabunny/dist/modules/src/metadata.js
var Ze = class {
	constructor(e, t) {
		if (this.data = e, this.mimeType = t, !(e instanceof Uint8Array)) throw TypeError("data must be a Uint8Array.");
		if (typeof t != "string") throw TypeError("mimeType must be a string.");
	}
}, Qe = class {
	constructor(e, t, n, r) {
		if (this.data = e, this.mimeType = t, this.name = n, this.description = r, !(e instanceof Uint8Array)) throw TypeError("data must be a Uint8Array.");
		if (t !== void 0 && typeof t != "string") throw TypeError("mimeType, when provided, must be a string.");
		if (n !== void 0 && typeof n != "string") throw TypeError("name, when provided, must be a string.");
		if (r !== void 0 && typeof r != "string") throw TypeError("description, when provided, must be a string.");
	}
}, $e = (e) => {
	if (!e || typeof e != "object") throw TypeError("tags must be an object.");
	if (e.title !== void 0 && typeof e.title != "string") throw TypeError("tags.title, when provided, must be a string.");
	if (e.description !== void 0 && typeof e.description != "string") throw TypeError("tags.description, when provided, must be a string.");
	if (e.artist !== void 0 && typeof e.artist != "string") throw TypeError("tags.artist, when provided, must be a string.");
	if (e.album !== void 0 && typeof e.album != "string") throw TypeError("tags.album, when provided, must be a string.");
	if (e.albumArtist !== void 0 && typeof e.albumArtist != "string") throw TypeError("tags.albumArtist, when provided, must be a string.");
	if (e.trackNumber !== void 0 && (!Number.isInteger(e.trackNumber) || e.trackNumber <= 0)) throw TypeError("tags.trackNumber, when provided, must be a positive integer.");
	if (e.tracksTotal !== void 0 && (!Number.isInteger(e.tracksTotal) || e.tracksTotal <= 0)) throw TypeError("tags.tracksTotal, when provided, must be a positive integer.");
	if (e.discNumber !== void 0 && (!Number.isInteger(e.discNumber) || e.discNumber <= 0)) throw TypeError("tags.discNumber, when provided, must be a positive integer.");
	if (e.discsTotal !== void 0 && (!Number.isInteger(e.discsTotal) || e.discsTotal <= 0)) throw TypeError("tags.discsTotal, when provided, must be a positive integer.");
	if (e.genre !== void 0 && typeof e.genre != "string") throw TypeError("tags.genre, when provided, must be a string.");
	if (e.date !== void 0 && (!(e.date instanceof Date) || Number.isNaN(e.date.getTime()))) throw TypeError("tags.date, when provided, must be a valid Date.");
	if (e.lyrics !== void 0 && typeof e.lyrics != "string") throw TypeError("tags.lyrics, when provided, must be a string.");
	if (e.images !== void 0) {
		if (!Array.isArray(e.images)) throw TypeError("tags.images, when provided, must be an array.");
		for (let t of e.images) {
			if (!t || typeof t != "object") throw TypeError("Each image in tags.images must be an object.");
			if (!(t.data instanceof Uint8Array)) throw TypeError("Each image.data must be a Uint8Array.");
			if (typeof t.mimeType != "string") throw TypeError("Each image.mimeType must be a string.");
			if (![
				"coverFront",
				"coverBack",
				"unknown"
			].includes(t.kind)) throw TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
		}
	}
	if (e.comment !== void 0 && typeof e.comment != "string") throw TypeError("tags.comment, when provided, must be a string.");
	if (e.raw !== void 0) {
		if (!e.raw || typeof e.raw != "object") throw TypeError("tags.raw, when provided, must be an object.");
		for (let t of Object.values(e.raw)) if (t !== null && typeof t != "string" && !(t instanceof Uint8Array) && !(t instanceof Ze) && !(t instanceof Qe) && !Ye(t)) throw TypeError("Each value in tags.raw must be a string, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.");
	}
}, et = {
	default: !0,
	primary: !0,
	forced: !1,
	original: !1,
	commentary: !1,
	hearingImpaired: !1,
	visuallyImpaired: !1
}, tt = (e) => {
	if (!e || typeof e != "object") throw TypeError("disposition must be an object.");
	if (e.default !== void 0 && typeof e.default != "boolean") throw TypeError("disposition.default must be a boolean.");
	if (e.primary !== void 0 && typeof e.primary != "boolean") throw TypeError("disposition.primary must be a boolean.");
	if (e.forced !== void 0 && typeof e.forced != "boolean") throw TypeError("disposition.forced must be a boolean.");
	if (e.original !== void 0 && typeof e.original != "boolean") throw TypeError("disposition.original must be a boolean.");
	if (e.commentary !== void 0 && typeof e.commentary != "boolean") throw TypeError("disposition.commentary must be a boolean.");
	if (e.hearingImpaired !== void 0 && typeof e.hearingImpaired != "boolean") throw TypeError("disposition.hearingImpaired must be a boolean.");
	if (e.visuallyImpaired !== void 0 && typeof e.visuallyImpaired != "boolean") throw TypeError("disposition.visuallyImpaired must be a boolean.");
}, M = class e {
	constructor(e) {
		this.bytes = e, this.pos = 0;
	}
	seekToByte(e) {
		this.pos = 8 * e;
	}
	readBit() {
		let e = Math.floor(this.pos / 8), t = this.bytes[e] ?? 0, n = 7 - (this.pos & 7), r = (t & 1 << n) >> n;
		return this.pos++, r;
	}
	readBits(e) {
		if (e === 1) return this.readBit();
		let t = 0;
		for (let n = 0; n < e; n++) t <<= 1, t |= this.readBit();
		return t;
	}
	writeBits(e, t) {
		let n = this.pos + e;
		for (let e = this.pos; e < n; e++) {
			let r = Math.floor(e / 8), i = this.bytes[r], a = 7 - (e & 7);
			i &= ~(1 << a), i |= (t & 1 << n - e - 1) >> n - e - 1 << a, this.bytes[r] = i;
		}
		this.pos = n;
	}
	readAlignedByte() {
		if (this.pos % 8 != 0) throw Error("Bitstream is not byte-aligned.");
		let e = this.pos / 8, t = this.bytes[e] ?? 0;
		return this.pos += 8, t;
	}
	skipBits(e) {
		this.pos += e;
	}
	getBitsLeft() {
		return this.bytes.length * 8 - this.pos;
	}
	clone() {
		let t = new e(this.bytes);
		return t.pos = this.pos, t;
	}
}, nt = [
	96e3,
	88200,
	64e3,
	48e3,
	44100,
	32e3,
	24e3,
	22050,
	16e3,
	12e3,
	11025,
	8e3,
	7350
], rt = [
	-1,
	1,
	2,
	3,
	4,
	5,
	6,
	8
], it = (e) => {
	if (!e || e.byteLength < 2) throw TypeError("AAC description must be at least 2 bytes long.");
	let t = new M(e), n = at(t), { frequencyIndex: r, sampleRate: i } = ot(t), a = t.readBits(4), o = null;
	a >= 1 && a <= 7 && (o = rt[a]);
	let s = n, c = !1, l = i;
	if (n === 5 || n === 29) c = n === 29, l = ot(t).sampleRate, s = at(t), s === 22 && t.skipBits(4);
	else for (; t.getBitsLeft() > 15;) {
		let e = t.pos;
		if (t.readBits(11) !== 695) {
			t.pos = e + 1;
			continue;
		}
		at(t) === 5 && t.readBits(1) && (l = ot(t).sampleRate, t.getBitsLeft() > 11 && t.readBits(11) === 1352 && (c = !!t.readBits(1)));
		break;
	}
	return o !== null && o > 1 && (c = !1), {
		objectType: n,
		coreObjectType: s,
		frequencyIndex: r,
		channelConfiguration: a,
		outputSampleRate: l,
		outputNumberOfChannels: c && o === 1 ? 2 : o
	};
}, at = (e) => {
	let t = e.readBits(5);
	return t === 31 ? 32 + e.readBits(6) : t;
}, ot = (e) => {
	let t = e.readBits(4);
	return t === 15 ? {
		frequencyIndex: t,
		sampleRate: e.readBits(24)
	} : {
		frequencyIndex: t,
		sampleRate: t < nt.length ? nt[t] : null
	};
}, st = (e) => {
	let t = e.objectType === 5 || e.objectType === 29, n = e.objectType === 29, r = t ? e.outputSampleRate / 2 : e.outputSampleRate, i = n ? 1 : e.outputNumberOfChannels, a = rt.indexOf(i);
	if (a === -1) throw TypeError(`Unsupported number of channels: ${e.outputNumberOfChannels}`);
	let o = 16;
	e.objectType >= 32 && (o += 6), ut(r) === 15 && (o += 24), t && (o += 9, ut(e.outputSampleRate) === 15 && (o += 24));
	let s = Math.ceil(o / 8), c = new Uint8Array(s), l = new M(c);
	return ct(l, e.objectType), lt(l, r), l.writeBits(4, a), t && (lt(l, e.outputSampleRate), ct(l, 2)), l.writeBits(3, 0), c;
}, ct = (e, t) => {
	t < 32 ? e.writeBits(5, t) : (e.writeBits(5, 31), e.writeBits(6, t - 32));
}, lt = (e, t) => {
	let n = ut(t);
	e.writeBits(4, n), n === 15 && e.writeBits(24, t);
}, ut = (e) => {
	let t = nt.indexOf(e);
	return t === -1 ? 15 : t;
}, dt = [
	48e3,
	44100,
	32e3
], ft = [
	24e3,
	22050,
	16e3
], N;
(function(e) {
	e[e.NON_IDR_SLICE = 1] = "NON_IDR_SLICE", e[e.SLICE_DPA = 2] = "SLICE_DPA", e[e.SLICE_DPB = 3] = "SLICE_DPB", e[e.SLICE_DPC = 4] = "SLICE_DPC", e[e.IDR = 5] = "IDR", e[e.SEI = 6] = "SEI", e[e.SPS = 7] = "SPS", e[e.PPS = 8] = "PPS", e[e.AUD = 9] = "AUD", e[e.SPS_EXT = 13] = "SPS_EXT";
})(N ||= {});
var P;
(function(e) {
	e[e.RASL_N = 8] = "RASL_N", e[e.RASL_R = 9] = "RASL_R", e[e.BLA_W_LP = 16] = "BLA_W_LP", e[e.RSV_IRAP_VCL23 = 23] = "RSV_IRAP_VCL23", e[e.VPS_NUT = 32] = "VPS_NUT", e[e.SPS_NUT = 33] = "SPS_NUT", e[e.PPS_NUT = 34] = "PPS_NUT", e[e.AUD_NUT = 35] = "AUD_NUT", e[e.PREFIX_SEI_NUT = 39] = "PREFIX_SEI_NUT", e[e.SUFFIX_SEI_NUT = 40] = "SUFFIX_SEI_NUT";
})(P ||= {});
var pt = function* (e) {
	let t = 0, n = -1;
	for (; t < e.length - 2;) {
		let r = e.indexOf(0, t);
		if (r === -1 || r >= e.length - 2) break;
		t = r;
		let i = 0;
		if (t + 3 < e.length && e[t + 1] === 0 && e[t + 2] === 0 && e[t + 3] === 1 ? i = 4 : e[t + 1] === 0 && e[t + 2] === 1 && (i = 3), i === 0) {
			t++;
			continue;
		}
		n !== -1 && t > n && (yield {
			offset: n,
			length: t - n
		}), n = t + i, t = n;
	}
	n !== -1 && n < e.length && (yield {
		offset: n,
		length: e.length - n
	});
}, mt = function* (e, n) {
	let r = 0, i = new DataView(e.buffer, e.byteOffset, e.byteLength);
	for (; r + n <= e.length;) {
		let e;
		n === 1 ? e = i.getUint8(r) : n === 2 ? e = i.getUint16(r, !1) : n === 3 ? e = se(i, r, !1) : (t(n === 4), e = i.getUint32(r, !1)), r += n, yield {
			offset: r,
			length: e
		}, r += e;
	}
}, ht = (e, t) => t.description ? mt(e, (s(t.description)[4] & 3) + 1) : pt(e), gt = (e) => e & 31, _t = (e) => {
	let t = [], n = e.length;
	for (let r = 0; r < n; r++) r + 2 < n && e[r] === 0 && e[r + 1] === 0 && e[r + 2] === 3 ? (t.push(0, 0), r += 2) : t.push(e[r]);
	return new Uint8Array(t);
}, vt = new Uint8Array([
	0,
	0,
	0,
	1
]), yt = (e) => {
	let t = e.reduce((e, t) => e + vt.byteLength + t.byteLength, 0), n = new Uint8Array(t), r = 0;
	for (let t of e) n.set(vt, r), r += vt.byteLength, n.set(t, r), r += t.byteLength;
	return n;
}, bt = (e, t) => {
	let n = e.reduce((e, n) => e + t + n.byteLength, 0), r = new Uint8Array(n), i = 0;
	for (let n of e) {
		let e = new DataView(r.buffer, r.byteOffset, r.byteLength);
		switch (t) {
			case 1:
				e.setUint8(i, n.byteLength);
				break;
			case 2:
				e.setUint16(i, n.byteLength, !1);
				break;
			case 3:
				ce(e, i, n.byteLength, !1);
				break;
			case 4: e.setUint32(i, n.byteLength, !1);
		}
		i += t, r.set(n, i), i += n.byteLength;
	}
	return r;
}, xt = (e, t) => t.description ? bt(e, (s(t.description)[4] & 3) + 1) : yt(e), St = (e) => {
	try {
		let n = [], r = [], i = [];
		for (let t of pt(e)) {
			let a = e.subarray(t.offset, t.offset + t.length), o = gt(a[0]);
			o === N.SPS ? n.push(a) : o === N.PPS ? r.push(a) : o === N.SPS_EXT && i.push(a);
		}
		if (n.length === 0 || r.length === 0) return null;
		let a = n[0], o = Tt(a);
		t(o !== null);
		let s = o.profileIdc === 100 || o.profileIdc === 110 || o.profileIdc === 122 || o.profileIdc === 144;
		return {
			configurationVersion: 1,
			avcProfileIndication: o.profileIdc,
			profileCompatibility: o.constraintFlags,
			avcLevelIndication: o.levelIdc,
			lengthSizeMinusOne: 3,
			sequenceParameterSets: n,
			pictureParameterSets: r,
			chromaFormat: s ? o.chromaFormatIdc : null,
			bitDepthLumaMinus8: s ? o.bitDepthLumaMinus8 : null,
			bitDepthChromaMinus8: s ? o.bitDepthChromaMinus8 : null,
			sequenceParameterSetExt: s ? i : null
		};
	} catch (e) {
		return j._error("Error building AVC Decoder Configuration Record:", e), null;
	}
}, Ct = (e) => {
	try {
		let t = c(e), n = 0, r = t.getUint8(n++), i = t.getUint8(n++), a = t.getUint8(n++), o = t.getUint8(n++), s = t.getUint8(n++) & 3, l = t.getUint8(n++) & 31, u = [];
		for (let r = 0; r < l; r++) {
			let r = t.getUint16(n, !1);
			n += 2, u.push(e.subarray(n, n + r)), n += r;
		}
		let d = t.getUint8(n++), f = [];
		for (let r = 0; r < d; r++) {
			let r = t.getUint16(n, !1);
			n += 2, f.push(e.subarray(n, n + r)), n += r;
		}
		let p = {
			configurationVersion: r,
			avcProfileIndication: i,
			profileCompatibility: a,
			avcLevelIndication: o,
			lengthSizeMinusOne: s,
			sequenceParameterSets: u,
			pictureParameterSets: f,
			chromaFormat: null,
			bitDepthLumaMinus8: null,
			bitDepthChromaMinus8: null,
			sequenceParameterSetExt: null
		};
		if ((i === 100 || i === 110 || i === 122 || i === 144) && n + 4 <= e.length) {
			let r = t.getUint8(n++) & 3, i = t.getUint8(n++) & 7, a = t.getUint8(n++) & 7, o = t.getUint8(n++);
			p.chromaFormat = r, p.bitDepthLumaMinus8 = i, p.bitDepthChromaMinus8 = a;
			let s = [];
			for (let r = 0; r < o; r++) {
				let r = t.getUint16(n, !1);
				n += 2, s.push(e.subarray(n, n + r)), n += r;
			}
			p.sequenceParameterSetExt = s;
		}
		return p;
	} catch (e) {
		return j._error("Error deserializing AVC Decoder Configuration Record:", e), null;
	}
}, wt = {
	1: {
		num: 1,
		den: 1
	},
	2: {
		num: 12,
		den: 11
	},
	3: {
		num: 10,
		den: 11
	},
	4: {
		num: 16,
		den: 11
	},
	5: {
		num: 40,
		den: 33
	},
	6: {
		num: 24,
		den: 11
	},
	7: {
		num: 20,
		den: 11
	},
	8: {
		num: 32,
		den: 11
	},
	9: {
		num: 80,
		den: 33
	},
	10: {
		num: 18,
		den: 11
	},
	11: {
		num: 15,
		den: 11
	},
	12: {
		num: 64,
		den: 33
	},
	13: {
		num: 160,
		den: 99
	},
	14: {
		num: 4,
		den: 3
	},
	15: {
		num: 3,
		den: 2
	},
	16: {
		num: 2,
		den: 1
	}
}, Tt = (e) => {
	try {
		let n = new M(_t(e));
		if (n.skipBits(1), n.skipBits(2), n.readBits(5) !== 7) return null;
		let o = n.readAlignedByte(), s = n.readAlignedByte(), c = n.readAlignedByte();
		i(n);
		let l = 1, u = 0, d = 0, f = 0;
		if ((o === 100 || o === 110 || o === 122 || o === 244 || o === 44 || o === 83 || o === 86 || o === 118 || o === 128) && (l = i(n), l === 3 && (f = n.readBits(1)), u = i(n), d = i(n), n.skipBits(1), n.readBits(1))) {
			for (let e = 0; e < (l === 3 ? 12 : 8); e++) if (n.readBits(1)) {
				let t = e < 6 ? 16 : 64, r = 8, i = 8;
				for (let e = 0; e < t; e++) {
					if (i !== 0) {
						let e = a(n);
						i = (r + e + 256) % 256;
					}
					r = i === 0 ? r : i;
				}
			}
		}
		i(n);
		let p = i(n);
		if (p === 0) i(n);
		else if (p === 1) {
			n.skipBits(1), a(n), a(n);
			let e = i(n);
			for (let t = 0; t < e; t++) a(n);
		}
		i(n), n.skipBits(1);
		let m = i(n), h = i(n), g = 16 * (m + 1), _ = 16 * (h + 1), v = g, y = _, b = n.readBits(1);
		if (b || n.skipBits(1), n.skipBits(1), n.readBits(1)) {
			let e = i(n), t = i(n), r = i(n), a = i(n), o, s;
			if ((f === 0 ? l : 0) === 0) o = 1, s = 2 - b;
			else {
				let e = l === 3 ? 1 : 2, t = l === 1 ? 2 : 1;
				o = e, s = t * (2 - b);
			}
			v -= o * (e + t), y -= s * (r + a);
		}
		let x = 2, S = 2, C = 2, w = 0, T = {
			num: 1,
			den: 1
		}, E = null, D = null;
		if (n.readBits(1)) {
			if (n.readBits(1)) {
				let e = n.readBits(8);
				if (e === 255) T = {
					num: n.readBits(16),
					den: n.readBits(16)
				};
				else {
					let t = wt[e];
					t && (T = t);
				}
			}
			n.readBits(1) && n.skipBits(1), n.readBits(1) && (n.skipBits(3), w = n.readBits(1), n.readBits(1) && (x = n.readBits(8), S = n.readBits(8), C = n.readBits(8))), n.readBits(1) && (i(n), i(n)), n.readBits(1) && (n.skipBits(32), n.skipBits(32), n.skipBits(1));
			let e = n.readBits(1);
			e && Et(n);
			let t = n.readBits(1);
			t && Et(n), (e || t) && n.skipBits(1), n.skipBits(1), n.readBits(1) && (n.skipBits(1), i(n), i(n), i(n), i(n), E = i(n), D = i(n));
		}
		if (E === null) {
			t(D === null);
			let e = s & 16;
			if ((o === 44 || o === 86 || o === 100 || o === 110 || o === 122 || o === 244) && e) E = 0, D = 0;
			else {
				let e = m + 1, t = h + 1, n = (2 - b) * t, i = Pn.find((e) => e.level >= c) ?? r(Pn), a = Math.min(Math.floor(i.maxDpbMbs / (e * n)), 16);
				E = a, D = a;
			}
		}
		return t(D !== null), {
			profileIdc: o,
			constraintFlags: s,
			levelIdc: c,
			frameMbsOnlyFlag: b,
			chromaFormatIdc: l,
			bitDepthLumaMinus8: u,
			bitDepthChromaMinus8: d,
			codedWidth: g,
			codedHeight: _,
			displayWidth: v,
			displayHeight: y,
			pixelAspectRatio: T,
			colourPrimaries: x,
			matrixCoefficients: C,
			transferCharacteristics: S,
			fullRangeFlag: w,
			numReorderFrames: E,
			maxDecFrameBuffering: D
		};
	} catch (e) {
		return j._error("Error parsing AVC SPS:", e), null;
	}
}, Et = (e) => {
	let t = i(e);
	e.skipBits(4), e.skipBits(4);
	for (let n = 0; n <= t; n++) i(e), i(e), e.skipBits(1);
	e.skipBits(5), e.skipBits(5), e.skipBits(5), e.skipBits(5);
}, Dt = (e, t) => t.description ? bt(e, (s(t.description)[21] & 3) + 1) : yt(e), Ot = (e, t) => t.description ? mt(e, (s(t.description)[21] & 3) + 1) : pt(e), kt = (e) => e >> 1 & 63, At = (e) => {
	try {
		let t = new M(_t(e));
		t.skipBits(16), t.readBits(4);
		let n = t.readBits(3), r = t.readBits(1), { general_profile_space: a, general_tier_flag: o, general_profile_idc: s, general_profile_compatibility_flags: c, general_constraint_indicator_flags: l, general_level_idc: u } = Mt(t, n);
		i(t);
		let d = i(t), f = 0;
		d === 3 && (f = t.readBits(1));
		let p = i(t), m = i(t), h = p, g = m;
		if (t.readBits(1)) {
			let e = i(t), n = i(t), r = i(t), a = i(t), o = 1, s = 1, c = f === 0 ? d : 0;
			c === 1 ? (o = 2, s = 2) : c === 2 && (o = 2, s = 1), h -= (e + n) * o, g -= (r + a) * s;
		}
		let _ = i(t), v = i(t);
		i(t);
		let y = t.readBits(1) ? 0 : n, b = 0;
		for (let e = y; e <= n; e++) i(t), b = i(t), i(t);
		if (i(t), i(t), i(t), i(t), i(t), i(t), t.readBits(1) && t.readBits(1) && Nt(t), t.skipBits(1), t.skipBits(1), t.readBits(1) && (t.skipBits(4), t.skipBits(4), i(t), i(t), t.skipBits(1)), Pt(t, i(t)), t.readBits(1)) {
			let e = i(t);
			for (let n = 0; n < e; n++) i(t), t.skipBits(1);
		}
		t.skipBits(1), t.skipBits(1);
		let x = 2, S = 2, C = 2, w = 0, T = 0, E = {
			num: 1,
			den: 1
		};
		if (t.readBits(1)) {
			let e = It(t, n);
			E = e.pixelAspectRatio, x = e.colourPrimaries, S = e.transferCharacteristics, C = e.matrixCoefficients, w = e.fullRangeFlag, T = e.minSpatialSegmentationIdc;
		}
		return {
			displayWidth: h,
			displayHeight: g,
			pixelAspectRatio: E,
			colourPrimaries: x,
			transferCharacteristics: S,
			matrixCoefficients: C,
			fullRangeFlag: w,
			maxDecFrameBuffering: b + 1,
			spsMaxSubLayersMinus1: n,
			spsTemporalIdNestingFlag: r,
			generalProfileSpace: a,
			generalTierFlag: o,
			generalProfileIdc: s,
			generalProfileCompatibilityFlags: c,
			generalConstraintIndicatorFlags: l,
			generalLevelIdc: u,
			chromaFormatIdc: d,
			bitDepthLumaMinus8: _,
			bitDepthChromaMinus8: v,
			minSpatialSegmentationIdc: T
		};
	} catch (e) {
		return j._error("Error parsing HEVC SPS:", e), null;
	}
}, jt = (e) => {
	try {
		let t = [], n = [], r = [], o = [];
		for (let i of pt(e)) {
			let a = e.subarray(i.offset, i.offset + i.length), s = kt(a[0]);
			s === P.VPS_NUT ? t.push(a) : s === P.SPS_NUT ? n.push(a) : s === P.PPS_NUT ? r.push(a) : (s === P.PREFIX_SEI_NUT || s === P.SUFFIX_SEI_NUT) && o.push(a);
		}
		if (n.length === 0 || r.length === 0) return null;
		let s = At(n[0]);
		if (!s) return null;
		let c = 0;
		if (r.length > 0) {
			let e = r[0], t = new M(_t(e));
			t.skipBits(16), i(t), i(t), t.skipBits(1), t.skipBits(1), t.skipBits(3), t.skipBits(1), t.skipBits(1), i(t), i(t), a(t), t.skipBits(1), t.skipBits(1), t.readBits(1) && i(t), a(t), a(t), t.skipBits(1), t.skipBits(1), t.skipBits(1), t.skipBits(1);
			let n = t.readBits(1), o = t.readBits(1);
			c = !n && !o ? 0 : n && !o ? 2 : !n && o ? 3 : 0;
		}
		let l = [
			...t.length ? [{
				arrayCompleteness: 1,
				nalUnitType: P.VPS_NUT,
				nalUnits: t
			}] : [],
			...n.length ? [{
				arrayCompleteness: 1,
				nalUnitType: P.SPS_NUT,
				nalUnits: n
			}] : [],
			...r.length ? [{
				arrayCompleteness: 1,
				nalUnitType: P.PPS_NUT,
				nalUnits: r
			}] : [],
			...o.length ? [{
				arrayCompleteness: 1,
				nalUnitType: kt(o[0][0]),
				nalUnits: o
			}] : []
		];
		return {
			configurationVersion: 1,
			generalProfileSpace: s.generalProfileSpace,
			generalTierFlag: s.generalTierFlag,
			generalProfileIdc: s.generalProfileIdc,
			generalProfileCompatibilityFlags: s.generalProfileCompatibilityFlags,
			generalConstraintIndicatorFlags: s.generalConstraintIndicatorFlags,
			generalLevelIdc: s.generalLevelIdc,
			minSpatialSegmentationIdc: s.minSpatialSegmentationIdc,
			parallelismType: c,
			chromaFormatIdc: s.chromaFormatIdc,
			bitDepthLumaMinus8: s.bitDepthLumaMinus8,
			bitDepthChromaMinus8: s.bitDepthChromaMinus8,
			avgFrameRate: 0,
			constantFrameRate: 0,
			numTemporalLayers: s.spsMaxSubLayersMinus1 + 1,
			temporalIdNested: s.spsTemporalIdNestingFlag,
			lengthSizeMinusOne: 3,
			arrays: l
		};
	} catch (e) {
		return j._error("Error building HEVC Decoder Configuration Record:", e), null;
	}
}, Mt = (e, t) => {
	let n = e.readBits(2), r = e.readBits(1), i = e.readBits(5), a = 0;
	for (let t = 0; t < 32; t++) a = a << 1 | e.readBits(1);
	let o = /* @__PURE__ */ new Uint8Array(6);
	for (let t = 0; t < 6; t++) o[t] = e.readBits(8);
	let s = e.readBits(8), c = [], l = [];
	for (let n = 0; n < t; n++) c.push(e.readBits(1)), l.push(e.readBits(1));
	if (t > 0) for (let n = t; n < 8; n++) e.skipBits(2);
	for (let n = 0; n < t; n++) c[n] && e.skipBits(88), l[n] && e.skipBits(8);
	return {
		general_profile_space: n,
		general_tier_flag: r,
		general_profile_idc: i,
		general_profile_compatibility_flags: a,
		general_constraint_indicator_flags: o,
		general_level_idc: s
	};
}, Nt = (e) => {
	for (let t = 0; t < 4; t++) for (let n = 0; n < (t === 3 ? 2 : 6); n++) if (!e.readBits(1)) i(e);
	else {
		let n = Math.min(64, 1 << 4 + (t << 1));
		t > 1 && a(e);
		for (let t = 0; t < n; t++) a(e);
	}
}, Pt = (e, t) => {
	let n = [];
	for (let r = 0; r < t; r++) n[r] = Ft(e, r, t, n);
}, Ft = (e, t, n, r) => {
	let a = 0, o = 0, s = 0;
	if (t !== 0 && (o = e.readBits(1)), o) {
		s = t === n ? t - (i(e) + 1) : t - 1, e.readBits(1), i(e);
		let o = r[s] ?? 0;
		for (let t = 0; t <= o; t++) e.readBits(1) || e.readBits(1);
		a = r[s];
	} else {
		let t = i(e), n = i(e);
		for (let n = 0; n < t; n++) i(e), e.readBits(1);
		for (let t = 0; t < n; t++) i(e), e.readBits(1);
		a = t + n;
	}
	return a;
}, It = (e, t) => {
	let n = 2, r = 2, a = 2, o = 0, s = 0, c = {
		num: 1,
		den: 1
	};
	if (e.readBits(1)) {
		let t = e.readBits(8);
		if (t === 255) c = {
			num: e.readBits(16),
			den: e.readBits(16)
		};
		else {
			let e = wt[t];
			e && (c = e);
		}
	}
	return e.readBits(1) && e.readBits(1), e.readBits(1) && (e.readBits(3), o = e.readBits(1), e.readBits(1) && (n = e.readBits(8), r = e.readBits(8), a = e.readBits(8))), e.readBits(1) && (i(e), i(e)), e.readBits(1), e.readBits(1), e.readBits(1), e.readBits(1) && (i(e), i(e), i(e), i(e)), e.readBits(1) && (e.readBits(32), e.readBits(32), e.readBits(1) && i(e), e.readBits(1) && Lt(e, !0, t)), e.readBits(1) && (e.readBits(1), e.readBits(1), e.readBits(1), s = i(e), i(e), i(e), i(e), i(e)), {
		pixelAspectRatio: c,
		colourPrimaries: n,
		transferCharacteristics: r,
		matrixCoefficients: a,
		fullRangeFlag: o,
		minSpatialSegmentationIdc: s
	};
}, Lt = (e, t, n) => {
	let r = !1, a = !1, o = !1;
	t && (r = e.readBits(1) === 1, a = e.readBits(1) === 1, (r || a) && (o = e.readBits(1) === 1, o && (e.readBits(8), e.readBits(5), e.readBits(1), e.readBits(5)), e.readBits(4), e.readBits(4), o && e.readBits(4), e.readBits(5), e.readBits(5), e.readBits(5)));
	for (let t = 0; t <= n; t++) {
		let t = e.readBits(1) === 1, n = !0;
		t || (n = e.readBits(1) === 1);
		let s = !1;
		n ? i(e) : s = e.readBits(1) === 1;
		let c = 1;
		s || (c = i(e) + 1), r && Rt(e, c, o), a && Rt(e, c, o);
	}
}, Rt = (e, t, n) => {
	for (let r = 0; r < t; r++) i(e), i(e), n && (i(e), i(e)), e.readBits(1);
}, zt = (e) => {
	try {
		let t = c(e), n = 0, r = t.getUint8(n++), i = t.getUint8(n++), a = i >> 6 & 3, o = i >> 5 & 1, s = i & 31, l = t.getUint32(n, !1);
		n += 4;
		let u = e.subarray(n, n + 6);
		n += 6;
		let d = t.getUint8(n++), f = (t.getUint8(n++) & 15) << 8 | t.getUint8(n++), p = t.getUint8(n++) & 3, m = t.getUint8(n++) & 3, h = t.getUint8(n++) & 7, g = t.getUint8(n++) & 7, _ = t.getUint16(n, !1);
		n += 2;
		let v = t.getUint8(n++), y = v >> 6 & 3, b = v >> 3 & 7, x = v >> 2 & 1, S = v & 3, C = t.getUint8(n++), w = [];
		for (let r = 0; r < C; r++) {
			let r = t.getUint8(n++), i = r >> 7 & 1, a = r & 63, o = t.getUint16(n, !1);
			n += 2;
			let s = [];
			for (let r = 0; r < o; r++) {
				let r = t.getUint16(n, !1);
				n += 2, s.push(e.subarray(n, n + r)), n += r;
			}
			w.push({
				arrayCompleteness: i,
				nalUnitType: a,
				nalUnits: s
			});
		}
		return {
			configurationVersion: r,
			generalProfileSpace: a,
			generalTierFlag: o,
			generalProfileIdc: s,
			generalProfileCompatibilityFlags: l,
			generalConstraintIndicatorFlags: u,
			generalLevelIdc: d,
			minSpatialSegmentationIdc: f,
			parallelismType: p,
			chromaFormatIdc: m,
			bitDepthLumaMinus8: h,
			bitDepthChromaMinus8: g,
			avgFrameRate: _,
			constantFrameRate: y,
			numTemporalLayers: b,
			temporalIdNested: x,
			lengthSizeMinusOne: S,
			arrays: w
		};
	} catch (e) {
		return j._error("Error deserializing HEVC Decoder Configuration Record:", e), null;
	}
}, F;
(function(e) {
	e[e.audAllowed = 0] = "audAllowed", e[e.beforeFirstVcl = 1] = "beforeFirstVcl", e[e.afterFirstVcl = 2] = "afterFirstVcl", e[e.eoBitstreamAllowed = 3] = "eoBitstreamAllowed", e[e.noMoreDataAllowed = 4] = "noMoreDataAllowed";
})(F ||= {});
var Bt = (e, t) => {
	let n = /* @__PURE__ */ new Set(), r = F.audAllowed;
	for (let i of Ot(e, t)) {
		if (r === F.noMoreDataAllowed) {
			n.add(i.offset);
			continue;
		}
		let t = kt(e[i.offset]);
		if (r === F.eoBitstreamAllowed && t !== 37) {
			n.add(i.offset);
			continue;
		}
		let a = !1;
		t === 35 ? r > F.audAllowed ? a = !0 : r = F.beforeFirstVcl : t <= 31 ? r > F.afterFirstVcl ? a = !0 : r = F.afterFirstVcl : t === 36 ? r === F.afterFirstVcl ? r = F.eoBitstreamAllowed : a = !0 : t === 37 ? r < F.afterFirstVcl ? a = !0 : r = F.noMoreDataAllowed : t === 32 || t === 33 || t === 34 || t === 39 || t >= 41 && t <= 44 || t >= 48 && t <= 55 ? r > F.beforeFirstVcl ? a = !0 : r = F.beforeFirstVcl : (t === 38 || t === 40 || t >= 45 && t <= 47 || t >= 56 && t <= 63) && r < F.afterFirstVcl && (a = !0), a && n.add(i.offset);
	}
	if (n.size === 0) return null;
	let i = [];
	for (let r of Ot(e, t)) n.has(r.offset) || i.push(e.subarray(r.offset, r.offset + r.length));
	return Dt(i, t);
}, Vt = {
	1: {
		colourPrimaries: 5,
		transferCharacteristics: 6,
		matrixCoefficients: 5
	},
	2: {
		colourPrimaries: 1,
		transferCharacteristics: 1,
		matrixCoefficients: 1
	},
	3: {
		colourPrimaries: 6,
		transferCharacteristics: 6,
		matrixCoefficients: 6
	},
	4: {
		colourPrimaries: 7,
		transferCharacteristics: 7,
		matrixCoefficients: 7
	},
	5: {
		colourPrimaries: 9,
		transferCharacteristics: 14,
		matrixCoefficients: 9
	},
	7: {
		colourPrimaries: 1,
		transferCharacteristics: 13,
		matrixCoefficients: 0
	}
}, Ht = (e) => {
	let t = new M(e);
	if (t.readBits(2) !== 2) return null;
	let n = t.readBits(1), i = (t.readBits(1) << 1) + n;
	if (i === 3 && t.skipBits(1), t.readBits(1) === 1 || t.readBits(1) !== 0 || (t.skipBits(2), t.readBits(24) !== 4817730)) return null;
	let a = 8;
	i >= 2 && (a = t.readBits(1) ? 12 : 10);
	let o = t.readBits(3), s = 0, c = 0;
	if (o !== 7) {
		if (c = t.readBits(1), i === 1 || i === 3) {
			let e = t.readBits(1), n = t.readBits(1);
			s = !e && !n ? 3 : e && !n ? 2 : 1, t.skipBits(1);
		} else s = 1;
	} else s = 3, c = 1;
	let l = t.readBits(16), u = t.readBits(16), d = (l + 1) * (u + 1), f = r(In).level;
	for (let e of In) if (d <= e.maxPictureSize) {
		f = e.level;
		break;
	}
	let p = Vt[o], m = p?.colourPrimaries ?? 2, h = p?.transferCharacteristics ?? 2, g = p?.matrixCoefficients ?? 2;
	return {
		profile: i,
		level: f,
		bitDepth: a,
		chromaSubsampling: s,
		videoFullRangeFlag: c,
		colourPrimaries: m,
		transferCharacteristics: h,
		matrixCoefficients: g
	};
}, Ut = (e) => e.colourPrimaries !== 2 || e.transferCharacteristics !== 2 || e.matrixCoefficients !== 2, Wt = function* (e) {
	let n = new M(e), r = () => {
		let e = 0;
		for (let t = 0; t < 8; t++) {
			let r = n.readAlignedByte();
			if (e += (r & 127) * 2 ** (t * 7), !(r & 128)) break;
			if (t === 7 && r & 128) return null;
		}
		return e > 2 ** 32 - 1 ? null : e;
	};
	for (; n.getBitsLeft() >= 8;) {
		n.skipBits(1);
		let i = n.readBits(4), a = n.readBits(1), o = n.readBits(1);
		n.skipBits(1), a && n.skipBits(8);
		let s;
		if (o) {
			let e = r();
			if (e === null) return;
			s = e;
		} else s = Math.floor(n.getBitsLeft() / 8);
		t(n.pos % 8 == 0), yield {
			type: i,
			data: e.subarray(n.pos / 8, n.pos / 8 + s)
		}, n.skipBits(s * 8);
	}
}, Gt = (e) => {
	for (let { type: t, data: n } of Wt(e)) {
		if (t !== 1) continue;
		let e = new M(n), r = e.readBits(3);
		e.readBits(1);
		let i = e.readBits(1), a = 0, o = 0, s = 0;
		if (i) a = e.readBits(5);
		else {
			let t = e.readBits(1), n = 0;
			if (t) {
				if (e.skipBits(32), e.skipBits(32), e.readBits(1)) {
					let t = 0;
					for (; t < 32 && !e.readBits(1);) t++;
					t < 32 && e.skipBits(t);
				}
				n = e.readBits(1), n && (s = e.readBits(5), e.skipBits(32), e.skipBits(5), e.skipBits(5));
			}
			let r = e.readBits(1), i = e.readBits(5);
			for (let t = 0; t <= i; t++) {
				e.skipBits(12);
				let i = e.readBits(5);
				if (t === 0 && (a = i), i > 7) {
					let n = e.readBits(1);
					t === 0 && (o = n);
				}
				if (n && e.readBits(1)) {
					let t = s + 1;
					e.skipBits(t), e.skipBits(t), e.skipBits(1);
				}
				r && e.readBits(1) && e.skipBits(4);
			}
		}
		let c = e.readBits(4), l = e.readBits(4), u = c + 1;
		e.skipBits(u);
		let d = l + 1;
		e.skipBits(d);
		let f = 0;
		if (f = i ? 0 : e.readBits(1), f && (e.skipBits(4), e.skipBits(3)), e.skipBits(1), e.skipBits(1), e.skipBits(1), !i) {
			e.skipBits(1), e.skipBits(1), e.skipBits(1), e.skipBits(1);
			let t = e.readBits(1);
			t && (e.skipBits(1), e.skipBits(1));
			let n = e.readBits(1), r = 0;
			r = n ? 2 : e.readBits(1), r > 0 && (e.readBits(1) || e.skipBits(1)), t && e.skipBits(3);
		}
		e.skipBits(1), e.skipBits(1), e.skipBits(1);
		let p = e.readBits(1), m = 8;
		r === 2 && p ? m = e.readBits(1) ? 12 : 10 : r <= 2 && (m = p ? 10 : 8);
		let h = 0;
		r !== 1 && (h = e.readBits(1));
		let g = 2, _ = 2, v = 2;
		e.readBits(1) && (g = e.readBits(8), _ = e.readBits(8), v = e.readBits(8));
		let y = 0, b = 1, x = 1, S = 0;
		return h ? y = e.readBits(1) : g === 1 && _ === 13 && v === 0 ? (y = 1, b = 0, x = 0) : (y = e.readBits(1), r === 0 ? (b = 1, x = 1) : r === 1 ? (b = 0, x = 0) : m === 12 ? (b = e.readBits(1), x = b ? e.readBits(1) : 0) : (b = 1, x = 0), b && x && (S = e.readBits(2))), {
			profile: r,
			level: a,
			tier: o,
			bitDepth: m,
			monochrome: h,
			chromaSubsamplingX: b,
			chromaSubsamplingY: x,
			chromaSamplePosition: S,
			videoFullRangeFlag: y,
			colourPrimaries: g,
			transferCharacteristics: _,
			matrixCoefficients: v
		};
	}
	return null;
}, Kt = (e) => e.colourPrimaries !== 2 || e.transferCharacteristics !== 2 || e.matrixCoefficients !== 2, qt = (e) => {
	if (e.length < 36) return null;
	let t = c(e);
	return t.getUint32(4) !== 1768124518 || t.getUint16(8) < 28 ? null : {
		fullRange: !1,
		colourPrimaries: t.getUint8(22),
		transferCharacteristics: t.getUint8(23),
		matrixCoefficients: t.getUint8(24)
	};
}, Jt = (e) => {
	let t = c(e), n = t.getUint8(9), r = t.getUint16(10, !0), i = t.getUint32(12, !0), a = t.getInt16(16, !0), o = t.getUint8(18), s = null;
	return o && (s = e.subarray(19, 21 + n)), {
		outputChannelCount: n,
		preSkip: r,
		inputSampleRate: i,
		outputGain: a,
		channelMappingFamily: o,
		channelMappingTable: s
	};
}, Yt = [
	480,
	960,
	1920,
	2880,
	480,
	960,
	1920,
	2880,
	480,
	960,
	1920,
	2880,
	480,
	960,
	480,
	960,
	120,
	240,
	480,
	960,
	120,
	240,
	480,
	960,
	120,
	240,
	480,
	960,
	120,
	240,
	480,
	960
], Xt = (e) => {
	let t = e[0] >> 3, n = e[0] & 3, r;
	return r = n === 0 ? 1 : n === 1 || n === 2 ? 2 : e[1] & 63, { durationInSamples: Yt[t] * r };
}, Zt = (e) => {
	if (e.length < 7) throw Error("Setup header is too short.");
	if (e[0] !== 5) throw Error("Wrong packet type in Setup header.");
	if (String.fromCharCode(...e.slice(1, 7)) !== "vorbis") throw Error("Invalid packet signature in Setup header.");
	let t = e.length, n = new Uint8Array(t);
	for (let r = 0; r < t; r++) n[r] = e[t - 1 - r];
	let r = new M(n), i = 0;
	for (; r.getBitsLeft() > 97;) if (r.readBits(1) === 1) {
		i = r.pos;
		break;
	}
	if (i === 0) throw Error("Invalid Setup header: framing bit not found.");
	let a = 0, o = !1, s = 0;
	for (; r.getBitsLeft() >= 97;) {
		let e = r.pos, t = r.readBits(8), n = r.readBits(16), i = r.readBits(16);
		if (t > 63 || n !== 0 || i !== 0) {
			r.pos = e;
			break;
		}
		if (r.skipBits(1), a++, a > 64) break;
		r.clone().readBits(6) + 1 === a && (o = !0, s = a);
	}
	if (!o) throw Error("Invalid Setup header: mode header not found.");
	if (s > 63) throw Error(`Unsupported mode count: ${s}.`);
	let c = s;
	r.pos = 0, r.skipBits(i);
	let l = Array(c).fill(0);
	for (let e = c - 1; e >= 0; e--) r.skipBits(40), l[e] = r.readBits(1);
	return { modeBlockflags: l };
}, Qt = (e, n, r) => {
	switch (e) {
		case "avc":
			for (let e of ht(r, n)) {
				let t = r[e.offset], n = gt(t);
				if (n >= N.NON_IDR_SLICE && n <= N.SLICE_DPC) return "delta";
				if (n === N.IDR) return "key";
				if (n === N.SEI && !Ae()) {
					let t = _t(r.subarray(e.offset, e.offset + e.length)), n = 1;
					do {
						let e = 0;
						for (;;) {
							let r = t[n++];
							if (r === void 0 || (e += r, r < 255)) break;
						}
						let r = 0;
						for (;;) {
							let e = t[n++];
							if (e === void 0 || (r += e, e < 255)) break;
						}
						if (e === 6) {
							let e = new M(t);
							e.pos = 8 * n;
							let r = i(e), a = e.readBits(1);
							if (r === 0 && a === 1) return "key";
						}
						n += r;
					} while (n < t.length - 1);
				}
			}
			return "delta";
		case "hevc":
			for (let e of Ot(r, n)) {
				let t = kt(r[e.offset]);
				if (t < P.BLA_W_LP) return "delta";
				if (t <= P.RSV_IRAP_VCL23) return "key";
			}
			return "delta";
		case "vp8": return r[0] & 1 ? "delta" : "key";
		case "vp9": {
			let e = new M(r);
			if (e.readBits(2) !== 2) return null;
			let t = e.readBits(1);
			return (e.readBits(1) << 1) + t === 3 && e.skipBits(1), e.readBits(1) ? null : e.readBits(1) === 0 ? "key" : "delta";
		}
		case "av1": {
			let e = !1;
			for (let { type: t, data: n } of Wt(r)) if (t === 1) {
				let t = new M(n);
				t.skipBits(4), e = !!t.readBits(1);
			} else if (t === 3 || t === 6 || t === 7) {
				if (e) return "key";
				let t = new M(n);
				return t.readBits(1) ? null : t.readBits(2) === 0 ? "key" : "delta";
			}
			return null;
		}
		case "prores": return "key";
		default: oe(e), t(!1);
	}
}, $t;
(function(e) {
	e[e.STREAMINFO = 0] = "STREAMINFO", e[e.VORBIS_COMMENT = 4] = "VORBIS_COMMENT", e[e.PICTURE = 6] = "PICTURE";
})($t ||= {});
var en = (e, t) => {
	let n = c(e), r = 0, i = n.getUint32(r, !0);
	r += 4;
	let a = l.decode(e.subarray(r, r + i));
	r += i, i > 0 && (t.raw ??= {}, t.raw.vendor ??= a);
	let o = n.getUint32(r, !0);
	r += 4;
	for (let i = 0; i < o; i++) {
		let i = n.getUint32(r, !0);
		r += 4;
		let a = l.decode(e.subarray(r, r + i));
		r += i;
		let o = a.indexOf("=");
		if (o === -1) continue;
		let s = a.slice(0, o).toUpperCase(), u = a.slice(o + 1);
		switch (t.raw ??= {}, t.raw[s] ??= u, s) {
			case "TITLE":
				t.title ??= u;
				break;
			case "DESCRIPTION":
				t.description ??= u;
				break;
			case "ARTIST":
				t.artist ??= u;
				break;
			case "ALBUM":
				t.album ??= u;
				break;
			case "ALBUMARTIST":
				t.albumArtist ??= u;
				break;
			case "COMMENT":
				t.comment ??= u;
				break;
			case "LYRICS":
				t.lyrics ??= u;
				break;
			case "TRACKNUMBER":
				{
					let e = u.split("/"), n = Number.parseInt(e[0], 10), r = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(n) && n > 0 && (t.trackNumber ??= n), r && Number.isInteger(r) && r > 0 && (t.tracksTotal ??= r);
				}
				break;
			case "TRACKTOTAL":
				{
					let e = Number.parseInt(u, 10);
					Number.isInteger(e) && e > 0 && (t.tracksTotal ??= e);
				}
				break;
			case "DISCNUMBER":
				{
					let e = u.split("/"), n = Number.parseInt(e[0], 10), r = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(n) && n > 0 && (t.discNumber ??= n), r && Number.isInteger(r) && r > 0 && (t.discsTotal ??= r);
				}
				break;
			case "DISCTOTAL":
				{
					let e = Number.parseInt(u, 10);
					Number.isInteger(e) && e > 0 && (t.discsTotal ??= e);
				}
				break;
			case "DATE":
				{
					let e = new Date(u);
					Number.isNaN(e.getTime()) || (t.date ??= e);
				}
				break;
			case "GENRE":
				t.genre ??= u;
				break;
			case "METADATA_BLOCK_PICTURE": {
				let e = Le(u), n = c(e), r = n.getUint32(0, !1), i = n.getUint32(4, !1), a = String.fromCharCode(...e.subarray(8, 8 + i)), o = n.getUint32(8 + i, !1), s = l.decode(e.subarray(12 + i, 12 + i + o)), d = n.getUint32(i + o + 28), f = e.subarray(i + o + 32, i + o + 32 + d);
				t.images ??= [], t.images.push({
					data: f,
					mimeType: a,
					kind: r === 3 ? "coverFront" : r === 4 ? "coverBack" : "unknown",
					name: void 0,
					description: s || void 0
				});
			}
		}
	}
}, tn = [
	2,
	1,
	2,
	3,
	3,
	4,
	4,
	5
], nn = (e) => {
	if (e.length < 7 || e[0] !== 11 || e[1] !== 119) return null;
	let t = new M(e);
	t.skipBits(16), t.skipBits(16);
	let n = t.readBits(2);
	if (n === 3) return null;
	let r = t.readBits(6), i = t.readBits(5);
	if (i > 8) return null;
	let a = t.readBits(3), o = t.readBits(3);
	return o & 1 && o !== 1 && t.skipBits(2), o & 4 && t.skipBits(2), o === 2 && t.skipBits(2), {
		fscod: n,
		bsid: i,
		bsmod: a,
		acmod: o,
		lfeon: t.readBits(1),
		bitRateCode: Math.floor(r / 2)
	};
}, rn = [
	128,
	138,
	192,
	128,
	140,
	192,
	160,
	174,
	240,
	160,
	176,
	240,
	192,
	208,
	288,
	192,
	210,
	288,
	224,
	242,
	336,
	224,
	244,
	336,
	256,
	278,
	384,
	256,
	280,
	384,
	320,
	348,
	480,
	320,
	350,
	480,
	384,
	416,
	576,
	384,
	418,
	576,
	448,
	486,
	672,
	448,
	488,
	672,
	512,
	556,
	768,
	512,
	558,
	768,
	640,
	696,
	960,
	640,
	698,
	960,
	768,
	834,
	1152,
	768,
	836,
	1152,
	896,
	974,
	1344,
	896,
	976,
	1344,
	1024,
	1114,
	1536,
	1024,
	1116,
	1536,
	1280,
	1392,
	1920,
	1280,
	1394,
	1920,
	1536,
	1670,
	2304,
	1536,
	1672,
	2304,
	1792,
	1950,
	2688,
	1792,
	1952,
	2688,
	2048,
	2228,
	3072,
	2048,
	2230,
	3072,
	2304,
	2506,
	3456,
	2304,
	2508,
	3456,
	2560,
	2786,
	3840,
	2560,
	2788,
	3840
], an = 1536;
new Uint8Array([
	5,
	4,
	65,
	67,
	45,
	51
]), new Uint8Array([
	5,
	4,
	69,
	65,
	67,
	51
]);
var on = [
	1,
	2,
	3,
	6
], sn = (e) => {
	if (e.length < 6 || e[0] !== 11 || e[1] !== 119) return null;
	let t = new M(e);
	t.skipBits(16);
	let n = t.readBits(2);
	if (t.skipBits(3), n !== 0 && n !== 2) return null;
	let r = t.readBits(11), i = t.readBits(2), a = 0, o;
	i === 3 ? (a = t.readBits(2), o = 3) : o = t.readBits(2);
	let s = t.readBits(3), c = t.readBits(1), l = t.readBits(5);
	if (l < 11 || l > 16) return null;
	let u = on[o], d;
	return d = i < 3 ? dt[i] / 1e3 : ft[a] / 1e3, {
		dataRate: Math.round((r + 1) * d / (u * 16)),
		substreams: [{
			fscod: i,
			fscod2: a,
			bsid: l,
			bsmod: 0,
			acmod: s,
			lfeon: c,
			numDepSub: 0,
			chanLoc: 0
		}]
	};
}, cn = (e) => {
	if (e.length < 2) return null;
	let t = new M(e), n = t.readBits(13), r = t.readBits(3), i = [];
	for (let n = 0; n <= r && !(Math.ceil(t.pos / 8) + 3 > e.length); n++) {
		let e = t.readBits(2), n = t.readBits(5);
		t.skipBits(1), t.skipBits(1);
		let r = t.readBits(3), a = t.readBits(3), o = t.readBits(1);
		t.skipBits(3);
		let s = t.readBits(4), c = 0;
		s > 0 ? c = t.readBits(9) : t.skipBits(1), i.push({
			fscod: e,
			fscod2: null,
			bsid: n,
			bsmod: r,
			acmod: a,
			lfeon: o,
			numDepSub: s,
			chanLoc: c
		});
	}
	return i.length === 0 ? null : {
		dataRate: n,
		substreams: i
	};
}, ln = (e) => {
	let n = e.substreams[0];
	return t(n), n.fscod < 3 ? dt[n.fscod] : n.fscod2 !== null && n.fscod2 < 3 ? ft[n.fscod2] : null;
}, un = (e) => {
	let n = e.substreams[0];
	t(n);
	let r = tn[n.acmod] + n.lfeon;
	if (n.numDepSub > 0) {
		let e = [
			2,
			2,
			1,
			1,
			2,
			2,
			2,
			1,
			1
		];
		for (let t = 0; t < 9; t++) n.chanLoc & 1 << 8 - t && (r += e[t]);
	}
	return r;
}, dn = 4096, fn = 8, pn = [
	0,
	8e3,
	16e3,
	32e3,
	0,
	0,
	11025,
	22050,
	44100,
	0,
	0,
	12e3,
	24e3,
	48e3,
	96e3,
	192e3
], mn = [
	32e3,
	56e3,
	64e3,
	96e3,
	112e3,
	128e3,
	192e3,
	224e3,
	256e3,
	32e4,
	384e3,
	448e3,
	512e3,
	576e3,
	64e4,
	768e3,
	96e4,
	1024e3,
	1152e3,
	128e4,
	1344e3,
	1408e3,
	1411200,
	1472e3,
	1536e3,
	192e4,
	2048e3,
	3072e3,
	384e4,
	0,
	0,
	0
], hn = [
	16,
	16,
	20,
	20,
	0,
	24,
	24,
	0
], gn = [
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	6,
	6,
	6,
	7,
	8,
	8
], _n = [
	1,
	2,
	2,
	2,
	2,
	3,
	18,
	19,
	6,
	7,
	518,
	323,
	83,
	519,
	582,
	535
], vn = 8, yn = 44646, bn = [
	32e3,
	44100,
	48e3,
	0
], xn = [
	8e3,
	16e3,
	32e3,
	64e3,
	128e3,
	22050,
	44100,
	88200,
	176400,
	352800,
	12e3,
	24e3,
	48e3,
	96e3,
	192e3,
	384e3
], Sn = [
	512,
	1024,
	2048,
	4096
], Cn = (e) => {
	let t = Tn(e), n = c(e), r = t ? Math.ceil(t.frameSize / 4) * 4 : 0, i = null;
	for (; r + 4 <= e.length && n.getUint32(r) === 1683496997;) {
		let t = En(e.subarray(r));
		if (!t) break;
		i ??= t, r += t.frameSize;
	}
	if (t) return {
		frameSize: i ? r : t.frameSize,
		sampleRate: t.sampleRate,
		numberOfChannels: t.numberOfChannels,
		sampleCount: t.sampleCount,
		channelLayout: t.channelLayout,
		pcmResolution: t.pcmResolution,
		bitRate: t.bitRate,
		core: t,
		hasExtensions: i !== null
	};
	if (!i?.asset) return null;
	let { asset: a } = i;
	return {
		frameSize: r,
		sampleRate: a.sampleRate,
		numberOfChannels: a.numberOfChannels,
		sampleCount: a.sampleCount,
		channelLayout: a.channelLayout,
		pcmResolution: a.pcmResolution,
		bitRate: 0,
		core: null,
		hasExtensions: !0
	};
}, wn = (e) => {
	let t = Cn(e);
	return t?.core ? t.hasExtensions ? "dtsh" : "dtsc" : null;
}, Tn = (e) => {
	if (e.length < 18 || e[0] !== 127 || e[1] !== 254 || e[2] !== 128 || e[3] !== 1) return null;
	let t = new M(e);
	if (t.skipBits(32), t.skipBits(1), t.readBits(5) !== 31) return null;
	let n = t.readBits(1), r = t.readBits(7) + 1;
	if (r % fn !== 0) return null;
	let i = t.readBits(14) + 1;
	if (i < 96) return null;
	let a = t.readBits(6);
	if (a >= gn.length) return null;
	let o = pn[t.readBits(4)];
	if (o === 0) return null;
	let s = mn[t.readBits(5)];
	if (t.readBits(1) !== 0) return null;
	t.skipBits(4), t.skipBits(5);
	let c = t.readBits(2);
	if (c === 3) return null;
	t.skipBits(1), n && t.skipBits(16), t.skipBits(7);
	let l = hn[t.readBits(3)];
	if (l === 0) return null;
	let u = c !== 0;
	return {
		frameSize: i,
		sampleRate: o,
		numberOfChannels: gn[a] + +!!u,
		sampleCount: r * 32,
		channelLayout: _n[a] | (u ? vn : 0),
		amode: a,
		lfePresent: u,
		bitRate: s,
		pcmResolution: l
	};
}, En = (e) => {
	if (e.length < 10 || e[0] !== 100 || e[1] !== 88 || e[2] !== 32 || e[3] !== 37) return null;
	let t = new M(e);
	t.skipBits(32), t.skipBits(8);
	let n = t.readBits(2), r = t.readBits(1), i = 8 + 4 * r, a = 16 + 4 * r;
	t.skipBits(i);
	let o = t.readBits(a) + 1, s = {
		frameSize: o,
		asset: null
	};
	if (!t.readBits(1)) return s;
	let c = bn[t.readBits(2)], l = 512 * (t.readBits(3) + 1);
	t.readBits(1) && t.skipBits(36);
	let u = t.readBits(3) + 1, d = t.readBits(3) + 1, f = [];
	for (let e = 0; e < u; e++) f.push(t.readBits(n + 1));
	for (let e of f) t.skipBits(8 * _e(e));
	if (t.readBits(1)) {
		t.skipBits(2);
		let e = t.readBits(2) + 1 << 2, n = t.readBits(2) + 1;
		t.skipBits(n * e);
	}
	for (let e = 0; e < d; e++) t.skipBits(a);
	t.skipBits(9), t.skipBits(3), t.readBits(1) && t.skipBits(4), t.readBits(1) && t.skipBits(24), t.readBits(1) && t.skipBits(8 * (t.readBits(10) + 1));
	let p = t.readBits(5) + 1, m = xn[t.readBits(4)], h = t.readBits(8) + 1, g = 0;
	if (t.readBits(1) && (h > 2 && t.skipBits(1), h > 6 && t.skipBits(1), t.readBits(1))) {
		let e = t.readBits(2) + 1 << 2;
		g = t.readBits(e);
	}
	return c === 0 || t.getBitsLeft() < 0 ? s : {
		frameSize: o,
		asset: {
			sampleRate: m,
			numberOfChannels: h,
			sampleCount: Math.round(l * m / c),
			channelLayout: g,
			pcmResolution: p
		}
	};
}, Dn = (e) => {
	if (e.length < 20) return null;
	let t = c(e), n = t.getUint32(0);
	if (n === 0) return null;
	let r = new M(e);
	r.seekToByte(13);
	let i = r.readBits(2);
	r.skipBits(5);
	let a = r.readBits(1), o = r.readBits(6);
	r.skipBits(14), r.skipBits(1), r.skipBits(3);
	let s = r.readBits(16), l = null;
	return s === 0 ? o < gn.length && (l = gn[o] + a) : l = On(s), {
		sampleRate: n,
		maxBitrate: t.getUint32(4),
		avgBitrate: t.getUint32(8),
		pcmSampleDepth: e[12],
		sampleCount: Sn[i],
		channelLayout: s,
		numberOfChannels: l
	};
}, On = (e) => _e(e) + _e(e & yn), kn = [
	"avc",
	"hevc",
	"vp9",
	"av1",
	"vp8",
	"prores"
], An = [
	"pcm-s16",
	"pcm-s16be",
	"pcm-s24",
	"pcm-s24be",
	"pcm-s32",
	"pcm-s32be",
	"pcm-f32",
	"pcm-f32be",
	"pcm-f64",
	"pcm-f64be",
	"pcm-u8",
	"pcm-s8",
	"ulaw",
	"alaw"
], jn = [
	"aac",
	"opus",
	"mp3",
	"vorbis",
	"flac",
	"ac3",
	"eac3",
	"dts"
], Mn = [...jn, ...An], Nn = ["webvtt"], Pn = [
	{
		maxMacroblocks: 99,
		maxBitrate: 64e3,
		maxDpbMbs: 396,
		level: 10
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 192e3,
		maxDpbMbs: 900,
		level: 11
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 384e3,
		maxDpbMbs: 2376,
		level: 12
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 768e3,
		maxDpbMbs: 2376,
		level: 13
	},
	{
		maxMacroblocks: 396,
		maxBitrate: 2e6,
		maxDpbMbs: 2376,
		level: 20
	},
	{
		maxMacroblocks: 792,
		maxBitrate: 4e6,
		maxDpbMbs: 4752,
		level: 21
	},
	{
		maxMacroblocks: 1620,
		maxBitrate: 4e6,
		maxDpbMbs: 8100,
		level: 22
	},
	{
		maxMacroblocks: 1620,
		maxBitrate: 1e7,
		maxDpbMbs: 8100,
		level: 30
	},
	{
		maxMacroblocks: 3600,
		maxBitrate: 14e6,
		maxDpbMbs: 18e3,
		level: 31
	},
	{
		maxMacroblocks: 5120,
		maxBitrate: 2e7,
		maxDpbMbs: 20480,
		level: 32
	},
	{
		maxMacroblocks: 8192,
		maxBitrate: 2e7,
		maxDpbMbs: 32768,
		level: 40
	},
	{
		maxMacroblocks: 8192,
		maxBitrate: 5e7,
		maxDpbMbs: 32768,
		level: 41
	},
	{
		maxMacroblocks: 8704,
		maxBitrate: 5e7,
		maxDpbMbs: 34816,
		level: 42
	},
	{
		maxMacroblocks: 22080,
		maxBitrate: 135e6,
		maxDpbMbs: 110400,
		level: 50
	},
	{
		maxMacroblocks: 36864,
		maxBitrate: 24e7,
		maxDpbMbs: 184320,
		level: 51
	},
	{
		maxMacroblocks: 36864,
		maxBitrate: 24e7,
		maxDpbMbs: 184320,
		level: 52
	},
	{
		maxMacroblocks: 139264,
		maxBitrate: 24e7,
		maxDpbMbs: 696320,
		level: 60
	},
	{
		maxMacroblocks: 139264,
		maxBitrate: 48e7,
		maxDpbMbs: 696320,
		level: 61
	},
	{
		maxMacroblocks: 139264,
		maxBitrate: 8e8,
		maxDpbMbs: 696320,
		level: 62
	}
], Fn = [
	{
		maxPictureSize: 36864,
		maxBitrate: 128e3,
		tier: "L",
		level: 30
	},
	{
		maxPictureSize: 122880,
		maxBitrate: 15e5,
		tier: "L",
		level: 60
	},
	{
		maxPictureSize: 245760,
		maxBitrate: 3e6,
		tier: "L",
		level: 63
	},
	{
		maxPictureSize: 552960,
		maxBitrate: 6e6,
		tier: "L",
		level: 90
	},
	{
		maxPictureSize: 983040,
		maxBitrate: 1e7,
		tier: "L",
		level: 93
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 12e6,
		tier: "L",
		level: 120
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 3e7,
		tier: "H",
		level: 120
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 2e7,
		tier: "L",
		level: 123
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 5e7,
		tier: "H",
		level: 123
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 25e6,
		tier: "L",
		level: 150
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 1e8,
		tier: "H",
		level: 150
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 4e7,
		tier: "L",
		level: 153
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 16e7,
		tier: "H",
		level: 153
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 6e7,
		tier: "L",
		level: 156
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 24e7,
		tier: "H",
		level: 156
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 6e7,
		tier: "L",
		level: 180
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "H",
		level: 180
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 12e7,
		tier: "L",
		level: 183
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 48e7,
		tier: "H",
		level: 183
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "L",
		level: 186
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 8e8,
		tier: "H",
		level: 186
	}
], In = [
	{
		maxPictureSize: 36864,
		maxBitrate: 2e5,
		level: 10
	},
	{
		maxPictureSize: 73728,
		maxBitrate: 8e5,
		level: 11
	},
	{
		maxPictureSize: 122880,
		maxBitrate: 18e5,
		level: 20
	},
	{
		maxPictureSize: 245760,
		maxBitrate: 36e5,
		level: 21
	},
	{
		maxPictureSize: 552960,
		maxBitrate: 72e5,
		level: 30
	},
	{
		maxPictureSize: 983040,
		maxBitrate: 12e6,
		level: 31
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 18e6,
		level: 40
	},
	{
		maxPictureSize: 2228224,
		maxBitrate: 3e7,
		level: 41
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 6e7,
		level: 50
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 12e7,
		level: 51
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 18e7,
		level: 52
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 18e7,
		level: 60
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		level: 61
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 48e7,
		level: 62
	}
], Ln = [
	{
		maxPictureSize: 147456,
		maxBitrate: 15e5,
		tier: "M",
		level: 0
	},
	{
		maxPictureSize: 278784,
		maxBitrate: 3e6,
		tier: "M",
		level: 1
	},
	{
		maxPictureSize: 665856,
		maxBitrate: 6e6,
		tier: "M",
		level: 4
	},
	{
		maxPictureSize: 1065024,
		maxBitrate: 1e7,
		tier: "M",
		level: 5
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 12e6,
		tier: "M",
		level: 8
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 3e7,
		tier: "H",
		level: 8
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 2e7,
		tier: "M",
		level: 9
	},
	{
		maxPictureSize: 2359296,
		maxBitrate: 5e7,
		tier: "H",
		level: 9
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 3e7,
		tier: "M",
		level: 12
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 1e8,
		tier: "H",
		level: 12
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 4e7,
		tier: "M",
		level: 13
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 16e7,
		tier: "H",
		level: 13
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 6e7,
		tier: "M",
		level: 14
	},
	{
		maxPictureSize: 8912896,
		maxBitrate: 24e7,
		tier: "H",
		level: 14
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 6e7,
		tier: "M",
		level: 15
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "H",
		level: 15
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 6e7,
		tier: "M",
		level: 16
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 24e7,
		tier: "H",
		level: 16
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 1e8,
		tier: "M",
		level: 17
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 48e7,
		tier: "H",
		level: 17
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 16e7,
		tier: "M",
		level: 18
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 8e8,
		tier: "H",
		level: 18
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 16e7,
		tier: "M",
		level: 19
	},
	{
		maxPictureSize: 35651584,
		maxBitrate: 8e8,
		tier: "H",
		level: 19
	}
], Rn = ".01.01.01.01.00", zn = ".0.110.01.01.01.0", Bn = [
	"ap4x",
	"ap4h",
	"apch",
	"apcn",
	"apcs",
	"apco"
], Vn = [
	"dtsc",
	"dtsh",
	"dtsl",
	"dtse"
], Hn = [
	{
		fourCc: "apco",
		bitrate: 45e6,
		alpha: !1
	},
	{
		fourCc: "apcs",
		bitrate: 102e6,
		alpha: !1
	},
	{
		fourCc: "apcn",
		bitrate: 147e6,
		alpha: !1
	},
	{
		fourCc: "apch",
		bitrate: 22e7,
		alpha: !1
	},
	{
		fourCc: "ap4h",
		bitrate: 33e7,
		alpha: !0
	},
	{
		fourCc: "ap4x",
		bitrate: 5e8,
		alpha: !0
	}
], Un = (e, t, n, i, a) => {
	if (e === "avc") {
		let e = Math.ceil(t / 16) * Math.ceil(n / 16), a = Pn.find((t) => e <= t.maxMacroblocks && i <= t.maxBitrate) ?? r(Pn), o = a ? a.level : 0;
		return `avc1.${"64".padStart(2, "0")}00${o.toString(16).padStart(2, "0")}`;
	}
	if (e === "hevc") {
		let e = t * n, a = Fn.find((t) => e <= t.maxPictureSize && i <= t.maxBitrate) ?? r(Fn);
		return `hev1.1.6.${a.tier}${a.level}.B0`;
	}
	if (e === "vp8") return "vp8";
	if (e === "vp9") {
		let e = t * n;
		return `vp09.00.${(In.find((t) => e <= t.maxPictureSize && i <= t.maxBitrate) ?? r(In)).level.toString().padStart(2, "0")}.08`;
	}
	if (e === "av1") {
		let e = t * n, a = Ln.find((t) => e <= t.maxPictureSize && i <= t.maxBitrate) ?? r(Ln);
		return `av01.0.${a.level.toString().padStart(2, "0")}${a.tier}.08`;
	}
	if (e === "prores") {
		let e = (t * n / 2073600) ** .95, r = Hn.filter((e) => e.alpha === a), o = r[0].fourCc, s = Infinity;
		for (let { fourCc: t, bitrate: n } of r) {
			let r = Math.abs(n * e - i);
			r < s && (s = r, o = t);
		}
		return o;
	}
	throw oe(e), TypeError(`Unhandled codec '${String(e)}'.`);
}, Wn = (e) => {
	let t = e.split(".");
	return [
		1,
		1,
		Number(t[1]),
		2,
		1,
		Number(t[2]),
		3,
		1,
		Number(t[3]),
		4,
		1,
		t[4] ? Number(t[4]) : 1
	];
}, Gn = (e) => {
	let t = e.split("."), n = Number(t[1]), r = t[2], i = Number(r.slice(0, -1)), a = (n << 5) + i, o = +(r.slice(-1) === "H"), s = Number(t[3]), c = s === 8 ? 0 : 1, l = +(s === 12), u = t[4] ? Number(t[4]) : 0, d = t[5] ? Number(t[5][0]) : 1, f = t[5] ? Number(t[5][1]) : 1, p = t[5] ? Number(t[5][2]) : 0;
	return [
		129,
		a,
		(o << 7) + (c << 6) + (l << 5) + (u << 4) + (d << 3) + (f << 2) + p,
		0
	];
}, Kn = (e) => {
	let { codec: n, codecDescription: i, colorSpace: a, avcCodecInfo: o, hevcCodecInfo: s, vp9CodecInfo: l, av1CodecInfo: u, proresFormat: d } = e;
	if (n === "avc") {
		if (t(e.avcType !== null), o) {
			let t = new Uint8Array([
				o.avcProfileIndication,
				o.profileCompatibility,
				o.avcLevelIndication
			]);
			return `avc${e.avcType}.${w(t)}`;
		}
		if (!i || i.byteLength < 4) throw TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
		return `avc${e.avcType}.${w(i.subarray(1, 4))}`;
	}
	if (n === "hevc") {
		let e, t, n, r, a, o;
		if (s) e = s.generalProfileSpace, t = s.generalProfileIdc, n = E(s.generalProfileCompatibilityFlags), r = s.generalTierFlag, a = s.generalLevelIdc, o = [...s.generalConstraintIndicatorFlags];
		else {
			if (!i || i.byteLength < 23) throw TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
			let s = c(i), l = s.getUint8(1);
			e = l >> 6 & 3, t = l & 31, n = E(s.getUint32(2)), r = l >> 5 & 1, a = s.getUint8(12), o = [];
			for (let e = 0; e < 6; e++) o.push(s.getUint8(6 + e));
		}
		let l = "hev1.";
		for (l += [
			"",
			"A",
			"B",
			"C"
		][e] + t, l += ".", l += n.toString(16).toUpperCase(), l += ".", l += r === 0 ? "L" : "H", l += a; o.length > 0 && o[o.length - 1] === 0;) o.pop();
		return o.length > 0 && (l += ".", l += o.map((e) => e.toString(16).toUpperCase()).join(".")), l;
	}
	if (n === "vp8") return "vp8";
	if (n === "vp9") {
		if (!l) {
			let t = e.width * e.height, n = r(In).level;
			for (let e of In) if (t <= e.maxPictureSize) {
				n = e.level;
				break;
			}
			return `vp09.00.${n.toString().padStart(2, "0")}.08`;
		}
		let t = l.profile.toString().padStart(2, "0"), n = l.level.toString().padStart(2, "0"), i = l.bitDepth.toString().padStart(2, "0"), a = l.chromaSubsampling.toString().padStart(2, "0"), o = l.colourPrimaries.toString().padStart(2, "0"), s = l.transferCharacteristics.toString().padStart(2, "0"), c = l.matrixCoefficients.toString().padStart(2, "0"), u = l.videoFullRangeFlag.toString().padStart(2, "0"), d = `vp09.${t}.${n}.${i}.${a}`;
		return d += `.${o}.${s}.${c}.${u}`, d.endsWith(Rn) && (d = d.slice(0, -15)), d;
	}
	if (n === "av1") {
		if (!u) {
			let t = e.width * e.height, n = r(In).level;
			for (let e of In) if (t <= e.maxPictureSize) {
				n = e.level;
				break;
			}
			return `av01.0.${n.toString().padStart(2, "0")}M.08`;
		}
		let t = u.profile, n = u.level.toString().padStart(2, "0"), i = u.tier ? "H" : "M", o = u.bitDepth.toString().padStart(2, "0"), s = u.monochrome ? "1" : "0", c = 100 * u.chromaSubsamplingX + 10 * u.chromaSubsamplingY + 1 * (u.chromaSubsamplingX && u.chromaSubsamplingY ? u.chromaSamplePosition : 0), l = a?.primaries ? f[a.primaries] : 1, d = a?.transfer ? m[a.transfer] : 1, p = a?.matrix ? g[a.matrix] : 1, h = +!!a?.fullRange, _ = `av01.${t}.${n}${i}.${o}`;
		return _ += `.${s}.${c.toString().padStart(3, "0")}`, _ += `.${l.toString().padStart(2, "0")}`, _ += `.${d.toString().padStart(2, "0")}`, _ += `.${p.toString().padStart(2, "0")}`, _ += `.${h}`, _.endsWith(zn) && (_ = _.slice(0, -17)), _;
	}
	if (n === "prores") return d ?? "apch";
	throw n !== null && oe(n), TypeError(`Unhandled codec '${n}'.`);
}, qn = (e) => {
	switch (e.codec) {
		case "avc":
			{
				let t = e.avcCodecInfo?.sequenceParameterSets[0];
				if (!t && e.codecDescription && (t = Ct(e.codecDescription)?.sequenceParameterSets[0]), t) {
					let e = Tt(t);
					if (e) return {
						primaries: p[e.colourPrimaries],
						transfer: h[e.transferCharacteristics],
						matrix: _[e.matrixCoefficients],
						fullRange: !!e.fullRangeFlag
					};
				}
			}
			break;
		case "hevc":
			{
				let t = e.hevcCodecInfo?.arrays.find((e) => e.nalUnitType === P.SPS_NUT)?.nalUnits[0];
				if (!t && e.codecDescription && (t = zt(e.codecDescription)?.arrays.find((e) => e.nalUnitType === P.SPS_NUT)?.nalUnits[0]), t) {
					let e = At(t);
					if (e) return {
						primaries: p[e.colourPrimaries],
						transfer: h[e.transferCharacteristics],
						matrix: _[e.matrixCoefficients],
						fullRange: !!e.fullRangeFlag
					};
				}
			}
			break;
		case "vp8": break;
		case "vp9":
			if (e.vp9CodecInfo) return {
				primaries: p[e.vp9CodecInfo.colourPrimaries],
				transfer: h[e.vp9CodecInfo.transferCharacteristics],
				matrix: _[e.vp9CodecInfo.matrixCoefficients],
				fullRange: !!e.vp9CodecInfo.videoFullRangeFlag
			};
			break;
		case "av1":
			if (e.av1CodecInfo) return {
				primaries: p[e.av1CodecInfo.colourPrimaries],
				transfer: h[e.av1CodecInfo.transferCharacteristics],
				matrix: _[e.av1CodecInfo.matrixCoefficients],
				fullRange: !!e.av1CodecInfo.videoFullRangeFlag
			};
			break;
		case "prores": if (e.proresCodecInfo) return {
			primaries: p[e.proresCodecInfo.colourPrimaries],
			transfer: h[e.proresCodecInfo.transferCharacteristics],
			matrix: _[e.proresCodecInfo.matrixCoefficients],
			fullRange: e.proresCodecInfo.fullRange
		};
	}
	return {
		primaries: void 0,
		transfer: void 0,
		matrix: void 0,
		fullRange: void 0
	};
}, Jn = (e) => {
	let { codec: t, codecDescription: n, aacCodecInfo: r, dtsFormat: i } = e;
	if (t === "aac") {
		if (!r) throw TypeError("AAC codec info must be provided.");
		if (r.isMpeg2) return "mp4a.67";
		{
			let e;
			return e = r.objectType === null ? it(n).objectType : r.objectType, `mp4a.40.${e}`;
		}
	}
	if (t === "mp3") return "mp3";
	if (t === "opus") return "opus";
	if (t === "vorbis") return "vorbis";
	if (t === "flac") return "flac";
	if (t === "ac3") return "ac-3";
	if (t === "eac3") return "ec-3";
	if (t === "dts") return i ?? "dtsc";
	if (t && An.includes(t)) return t;
	throw TypeError(`Unhandled codec '${t}'.`);
}, Yn = 48e3, Xn = /^pcm-([usf])(\d+)(be)?$/, Zn = (e) => {
	if (t(An.includes(e)), e === "ulaw") return {
		dataType: "ulaw",
		sampleSize: 1,
		littleEndian: !0,
		silentValue: 255
	};
	if (e === "alaw") return {
		dataType: "alaw",
		sampleSize: 1,
		littleEndian: !0,
		silentValue: 213
	};
	let n = Xn.exec(e);
	t(n);
	let r;
	r = n[1] === "u" ? "unsigned" : n[1] === "s" ? "signed" : "float";
	let i = Number(n[2]) / 8, a = n[3] !== "be";
	return {
		dataType: r,
		sampleSize: i,
		littleEndian: a,
		silentValue: e === "pcm-u8" ? 128 : 0
	};
}, Qn = (e) => e.startsWith("avc1") || e.startsWith("avc3") ? "avc" : e.startsWith("hev1") || e.startsWith("hvc1") ? "hevc" : e === "vp8" ? "vp8" : e.startsWith("vp09") ? "vp9" : e.startsWith("av01") ? "av1" : Bn.includes(e) ? "prores" : e === "mp3" || e === "mp4a.69" || e === "mp4a.6B" || e === "mp4a.6b" || e === "mp4a.40.34" ? "mp3" : e.startsWith("mp4a.40.") || e === "mp4a.67" ? "aac" : e === "opus" ? "opus" : e === "vorbis" ? "vorbis" : e === "flac" ? "flac" : e === "ac-3" || e === "ac3" ? "ac3" : e === "ec-3" || e === "eac3" ? "eac3" : Vn.includes(e) ? "dts" : e === "ulaw" ? "ulaw" : e === "alaw" ? "alaw" : Xn.test(e) ? e : e === "webvtt" ? "webvtt" : null, $n = (e) => e === "avc" ? { avc: { format: "avc" } } : e === "hevc" ? { hevc: { format: "hevc" } } : {}, er = [
	"avc1",
	"avc3",
	"hev1",
	"hvc1",
	"vp8",
	"vp09",
	"av01",
	...Bn
], tr = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/, nr = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/, rr = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/, ir = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/, ar = (e, t) => {
	if (!e) throw TypeError("Video chunk metadata must be provided.");
	if (typeof e != "object") throw TypeError("Video chunk metadata must be an object.");
	if (!e.decoderConfig) throw TypeError("Video chunk metadata must include a decoder configuration.");
	if (typeof e.decoderConfig != "object") throw TypeError("Video chunk metadata decoder configuration must be an object.");
	if (typeof e.decoderConfig.codec != "string") throw TypeError("Video chunk metadata decoder configuration must specify a codec string.");
	if (!er.some((t) => e.decoderConfig.codec.startsWith(t))) throw TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");
	if (!Number.isInteger(e.decoderConfig.codedWidth) || e.decoderConfig.codedWidth <= 0) throw TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
	if (!Number.isInteger(e.decoderConfig.codedHeight) || e.decoderConfig.codedHeight <= 0) throw TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
	if (e.decoderConfig.displayAspectWidth !== void 0 && (!Number.isInteger(e.decoderConfig.displayAspectWidth) || e.decoderConfig.displayAspectWidth <= 0)) throw TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");
	if (e.decoderConfig.displayAspectHeight !== void 0 && (!Number.isInteger(e.decoderConfig.displayAspectHeight) || e.decoderConfig.displayAspectHeight <= 0)) throw TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");
	if (e.decoderConfig.displayAspectWidth !== void 0 != (e.decoderConfig.displayAspectHeight !== void 0)) throw TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");
	if (e.decoderConfig.description !== void 0 && !x(e.decoderConfig.description)) throw TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
	if (e.decoderConfig.colorSpace !== void 0) {
		let { colorSpace: t } = e.decoderConfig;
		if (typeof t != "object") throw TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
		let n = Object.keys(f);
		if (t.primaries != null && !n.includes(t.primaries)) throw TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${n.join(", ")}.`);
		let r = Object.keys(m);
		if (t.transfer != null && !r.includes(t.transfer)) throw TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${r.join(", ")}.`);
		let i = Object.keys(g);
		if (t.matrix != null && !i.includes(t.matrix)) throw TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${i.join(", ")}.`);
		if (t.fullRange != null && typeof t.fullRange != "boolean") throw TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
	}
	if (e.decoderConfig.codec.startsWith("avc1") || e.decoderConfig.codec.startsWith("avc3")) {
		if (!tr.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.");
	} else if (e.decoderConfig.codec.startsWith("hev1") || e.decoderConfig.codec.startsWith("hvc1")) {
		if (!nr.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.");
	} else if (e.decoderConfig.codec.startsWith("vp8")) {
		if (e.decoderConfig.codec !== "vp8") throw TypeError("Video chunk metadata decoder configuration codec string for VP8 must be \"vp8\".");
	} else if (e.decoderConfig.codec.startsWith("vp09")) {
		if (!rr.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section \"Codecs Parameter String\" of https://www.webmproject.org/vp9/mp4/.");
	} else if (e.decoderConfig.codec.startsWith("av01")) {
		if (!ir.test(e.decoderConfig.codec)) throw TypeError("Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section \"Codecs Parameter String\" of https://aomediacodec.github.io/av1-isobmff/.");
	} else if (Bn.some((t) => e.decoderConfig.codec.startsWith(t)) && !Bn.some((t) => e.decoderConfig.codec === t)) throw TypeError(`Video chunk metadata decoder configuration codec string for ProRes must be one of the valid ProRes four-character codes: ${Bn.join(", ")}.`);
	if (t !== null && Qn(e.decoderConfig.codec) !== t) throw TypeError(`Video chunk metadata decoder configuration codec string '${e.decoderConfig.codec}' does not fit to the track codec '${t}'.`);
}, or = [
	"mp4a",
	"mp3",
	"opus",
	"vorbis",
	"flac",
	"ulaw",
	"alaw",
	"pcm",
	"ac-3",
	"ec-3",
	"dts"
], sr = (e, t) => {
	if (!e) throw TypeError("Audio chunk metadata must be provided.");
	if (typeof e != "object") throw TypeError("Audio chunk metadata must be an object.");
	if (!e.decoderConfig) throw TypeError("Audio chunk metadata must include a decoder configuration.");
	if (typeof e.decoderConfig != "object") throw TypeError("Audio chunk metadata decoder configuration must be an object.");
	if (typeof e.decoderConfig.codec != "string") throw TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
	if (!or.some((t) => e.decoderConfig.codec.startsWith(t))) throw TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");
	if (!Number.isInteger(e.decoderConfig.sampleRate) || e.decoderConfig.sampleRate <= 0) throw TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
	if (!Number.isInteger(e.decoderConfig.numberOfChannels) || e.decoderConfig.numberOfChannels <= 0) throw TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
	if (e.decoderConfig.description !== void 0 && !x(e.decoderConfig.description)) throw TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
	if (e.decoderConfig.codec.startsWith("mp4a") && e.decoderConfig.codec !== "mp4a.69" && e.decoderConfig.codec !== "mp4a.6B" && e.decoderConfig.codec !== "mp4a.6b") {
		if (![
			"mp4a.40.2",
			"mp4a.40.02",
			"mp4a.40.5",
			"mp4a.40.05",
			"mp4a.40.29",
			"mp4a.67"
		].includes(e.decoderConfig.codec)) throw TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.");
	} else if (e.decoderConfig.codec.startsWith("mp3") || e.decoderConfig.codec.startsWith("mp4a")) {
		if (e.decoderConfig.codec !== "mp3" && e.decoderConfig.codec !== "mp4a.69" && e.decoderConfig.codec !== "mp4a.6B" && e.decoderConfig.codec !== "mp4a.6b") throw TypeError("Audio chunk metadata decoder configuration codec string for MP3 must be \"mp3\", \"mp4a.69\" or \"mp4a.6B\".");
	} else if (e.decoderConfig.codec.startsWith("opus")) {
		if (e.decoderConfig.codec !== "opus") throw TypeError("Audio chunk metadata decoder configuration codec string for Opus must be \"opus\".");
		if (e.decoderConfig.description && e.decoderConfig.description.byteLength < 18) throw TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.");
	} else if (e.decoderConfig.codec.startsWith("vorbis")) {
		if (e.decoderConfig.codec !== "vorbis") throw TypeError("Audio chunk metadata decoder configuration codec string for Vorbis must be \"vorbis\".");
		if (!e.decoderConfig.description) throw TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.");
	} else if (e.decoderConfig.codec.startsWith("flac")) {
		if (e.decoderConfig.codec !== "flac") throw TypeError("Audio chunk metadata decoder configuration codec string for FLAC must be \"flac\".");
		if (!e.decoderConfig.description || e.decoderConfig.description.byteLength < 42) throw TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.");
	} else if (e.decoderConfig.codec.startsWith("ac-3") || e.decoderConfig.codec.startsWith("ac3")) {
		if (e.decoderConfig.codec !== "ac-3") throw TypeError("Audio chunk metadata decoder configuration codec string for AC-3 must be \"ac-3\".");
	} else if (e.decoderConfig.codec.startsWith("ec-3") || e.decoderConfig.codec.startsWith("eac3")) {
		if (e.decoderConfig.codec !== "ec-3") throw TypeError("Audio chunk metadata decoder configuration codec string for EC-3 must be \"ec-3\".");
	} else if (e.decoderConfig.codec.startsWith("dts")) {
		if (!Vn.includes(e.decoderConfig.codec)) throw TypeError(`Audio chunk metadata decoder configuration codec string for DTS must be one of the following four-character codes: ${Vn.join(", ")}.`);
	} else if ((e.decoderConfig.codec.startsWith("pcm") || e.decoderConfig.codec.startsWith("ulaw") || e.decoderConfig.codec.startsWith("alaw")) && !An.includes(e.decoderConfig.codec)) throw TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${An.join(", ")}).`);
	if (t !== null && Qn(e.decoderConfig.codec) !== t) throw TypeError(`Audio chunk metadata decoder configuration codec string '${e.decoderConfig.codec}' does not fit to the track codec '${t}'.`);
}, cr = (e) => {
	if (!e) throw TypeError("Subtitle metadata must be provided.");
	if (typeof e != "object") throw TypeError("Subtitle metadata must be an object.");
	if (!e.config) throw TypeError("Subtitle metadata must include a config object.");
	if (typeof e.config != "object") throw TypeError("Subtitle metadata config must be an object.");
	if (typeof e.config.description != "string") throw TypeError("Subtitle metadata config description must be a string.");
}, lr = [
	44100,
	48e3,
	32e3
], ur = [
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	160,
	192,
	224,
	256,
	320,
	-1,
	-1,
	32,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	160,
	192,
	224,
	256,
	320,
	384,
	-1,
	-1,
	32,
	64,
	96,
	128,
	160,
	192,
	224,
	256,
	288,
	320,
	352,
	384,
	416,
	448,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	-1,
	8,
	16,
	24,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	144,
	160,
	-1,
	-1,
	8,
	16,
	24,
	32,
	40,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	144,
	160,
	-1,
	-1,
	32,
	48,
	56,
	64,
	80,
	96,
	112,
	128,
	144,
	160,
	176,
	192,
	224,
	256,
	-1
], dr = (e, t, n, r, i) => t === 0 ? 0 : t === 1 ? Math.floor(144 * n / (r << e)) + i : t === 2 ? Math.floor(144 * n / r) + i : (Math.floor(12 * n / r) + i) * 4, fr = (e, t, n, r) => t === 0 ? 0 : t === 1 ? 144 * n / (r << e) : t === 2 ? 144 * n / r : 12 * n / r * 4, pr = (e, t) => e === 3 ? t === 3 ? 21 : 36 : t === 3 ? 13 : 21, mr = (e, t) => {
	let n = e >>> 24, r = e >>> 16 & 255, i = e >>> 8 & 255, a = e & 255;
	if (n !== 255 && r !== 255 && i !== 255 && a !== 255) return {
		header: null,
		bytesAdvanced: 4
	};
	if (n !== 255 || (r & 224) != 224) return {
		header: null,
		bytesAdvanced: 1
	};
	let o = 0, s = 0;
	r & 16 ? o = r & 8 ? 0 : 1 : (o = 1, s = 1);
	let c = r >> 3 & 3, l = r >> 1 & 3, u = i >> 4 & 15, d = (i >> 2 & 3) % 3, f = i >> 1 & 1, p = a >> 6 & 3, m = a >> 4 & 3, h = a >> 3 & 1, g = a >> 2 & 1, _ = a & 3, v = ur[o * 16 * 4 + l * 16 + u];
	if (v === -1) return {
		header: null,
		bytesAdvanced: 1
	};
	let y = v * 1e3, b = lr[d] >> o + s, x = dr(o, l, y, b, f);
	if (t !== null && t < x) return {
		header: null,
		bytesAdvanced: 1
	};
	let S;
	return S = c === 3 ? l === 3 ? 384 : 1152 : l === 3 ? 384 : l === 2 ? 1152 : 576, {
		header: {
			totalSize: x,
			mpegVersionId: c,
			lowSamplingFrequency: o,
			layer: l,
			bitrate: y,
			frequencyIndex: d,
			sampleRate: b,
			channel: p,
			modeExtension: m,
			copyright: h,
			original: g,
			emphasis: _,
			audioSamplesInFrame: S
		},
		bytesAdvanced: 1
	};
}, hr = (e) => {
	let t = 2130706432, n = 0;
	for (; t !== 0;) n >>= 1, n |= e & t, t >>= 8;
	return n;
}, gr;
(function(e) {
	e[e.FrameCount = 1] = "FrameCount", e[e.FileSize = 2] = "FileSize", e[e.Toc = 4] = "Toc";
})(gr ||= {});
var _r = (e) => e === 3 ? 1 : 2, vr = class {
	constructor(e) {
		this.input = e;
	}
	dispose() {}
}, I = /* #__PURE__ */ new Uint8Array(), L = class e {
	constructor(e, t, n, r, i = -1, a, o) {
		if (this.data = e, this.type = t, this.timestamp = n, this.duration = r, this.sequenceNumber = i, e === I && a === void 0) throw Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
		if (a === void 0 && (a = e.byteLength), !(e instanceof Uint8Array)) throw TypeError("data must be a Uint8Array.");
		if (t !== "key" && t !== "delta") throw TypeError("type must be either \"key\" or \"delta\".");
		if (!Number.isFinite(n)) throw TypeError("timestamp must be a number.");
		if (!Number.isFinite(r) || r < 0) throw TypeError("duration must be a non-negative number.");
		if (!Number.isFinite(i)) throw TypeError("sequenceNumber must be a number.");
		if (!Number.isInteger(a) || a < 0) throw TypeError("byteLength must be a non-negative integer.");
		if (o !== void 0 && (typeof o != "object" || !o)) throw TypeError("sideData, when provided, must be an object.");
		if (o?.alpha !== void 0 && !(o.alpha instanceof Uint8Array)) throw TypeError("sideData.alpha, when provided, must be a Uint8Array.");
		if (o?.alphaByteLength !== void 0 && (!Number.isInteger(o.alphaByteLength) || o.alphaByteLength < 0)) throw TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
		this.byteLength = a, this.sideData = o ?? {}, this.sideData.alpha && this.sideData.alphaByteLength === void 0 && (this.sideData.alphaByteLength = this.sideData.alpha.byteLength);
	}
	get isMetadataOnly() {
		return this.data === I;
	}
	get microsecondTimestamp() {
		return Math.trunc(be * this.timestamp);
	}
	get microsecondDuration() {
		return Math.trunc(be * this.duration);
	}
	toEncodedVideoChunk() {
		if (this.isMetadataOnly) throw TypeError("Metadata-only packets cannot be converted to a video chunk.");
		if (typeof EncodedVideoChunk > "u") throw Error("EncodedVideoChunk is not available in this environment.");
		return new EncodedVideoChunk({
			data: this.data,
			type: this.type,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration
		});
	}
	alphaToEncodedVideoChunk(e = this.type) {
		if (!this.sideData.alpha) throw TypeError("This packet does not contain alpha side data.");
		if (this.isMetadataOnly) throw TypeError("Metadata-only packets cannot be converted to a video chunk.");
		if (typeof EncodedVideoChunk > "u") throw Error("EncodedVideoChunk is not available in this environment.");
		return new EncodedVideoChunk({
			data: this.sideData.alpha,
			type: e,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration
		});
	}
	toEncodedAudioChunk() {
		if (this.isMetadataOnly) throw TypeError("Metadata-only packets cannot be converted to an audio chunk.");
		if (typeof EncodedAudioChunk > "u") throw Error("EncodedAudioChunk is not available in this environment.");
		return new EncodedAudioChunk({
			data: this.data,
			type: this.type,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration
		});
	}
	static fromEncodedChunk(t, n) {
		if (!(t instanceof EncodedVideoChunk || t instanceof EncodedAudioChunk)) throw TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
		let r = new Uint8Array(t.byteLength);
		return t.copyTo(r), new e(r, t.type, t.timestamp / 1e6, (t.duration ?? 0) / 1e6, void 0, void 0, n);
	}
	clone(t) {
		if (t !== void 0 && (typeof t != "object" || !t)) throw TypeError("options, when provided, must be an object.");
		if (t?.data !== void 0 && !(t.data instanceof Uint8Array)) throw TypeError("options.data, when provided, must be a Uint8Array.");
		if (t?.type !== void 0 && t.type !== "key" && t.type !== "delta") throw TypeError("options.type, when provided, must be either \"key\" or \"delta\".");
		if (t?.timestamp !== void 0 && !Number.isFinite(t.timestamp)) throw TypeError("options.timestamp, when provided, must be a number.");
		if (t?.duration !== void 0 && !Number.isFinite(t.duration)) throw TypeError("options.duration, when provided, must be a number.");
		if (t?.sequenceNumber !== void 0 && !Number.isFinite(t.sequenceNumber)) throw TypeError("options.sequenceNumber, when provided, must be a number.");
		if (t?.sideData !== void 0 && (typeof t.sideData != "object" || t.sideData === null)) throw TypeError("options.sideData, when provided, must be an object.");
		return new e(t?.data ?? this.data, t?.type ?? this.type, t?.timestamp ?? this.timestamp, t?.duration ?? this.duration, t?.sequenceNumber ?? this.sequenceNumber, this.byteLength, t?.sideData ?? this.sideData);
	}
}, yr = (e) => {
	let t = (e.hasVideo ? "video/" : e.hasAudio ? "audio/" : "application/") + (e.isQuickTime ? "quicktime" : "mp4");
	if (e.codecStrings.length > 0) {
		let n = [...new Set(e.codecStrings)];
		t += `; codecs="${n.join(", ")}"`;
	}
	return t;
}, br = (e) => {
	let t = c(e), n = 0, r = t.getUint8(n);
	n += 1, n += 3;
	let i = w(e.subarray(n, n + 16));
	n += 16;
	let a = null;
	if (r > 0) {
		let r = t.getUint32(n);
		if (n += 4, r > 0) {
			a = [];
			for (let t = 0; t < r; t++) a.push(w(e.subarray(n, n + 16))), n += 16;
		}
	}
	let o = t.getUint32(n);
	return n += 4, {
		systemId: i,
		keyIds: a,
		data: e.slice(n, n + o)
	};
}, xr = (e, t) => e.systemId === t.systemId && Re(e.data, t.data), Sr = (e) => {
	let t = X(e), n = Q(e, 4), r = 8;
	t === 1 && (t = Z(e), r = 16);
	let i = t - r;
	return i < 0 ? null : {
		name: n,
		totalSize: t,
		headerSize: r,
		contentSize: i
	};
}, Cr = (e) => ec(e) / 65536, wr = (e) => ec(e) / 1073741824, Tr = (e) => {
	let t = 0;
	for (let n = 0; n < 4; n++) {
		t <<= 7;
		let n = J(e);
		if (t |= n & 127, !(n & 128)) break;
	}
	return t;
}, Er = (e) => {
	let t = Y(e);
	return e.skip(2), t = Math.min(t, e.remainingLength), l.decode(q(e, t));
}, Dr = (e) => {
	let t = Sr(e);
	if (!t || t.name !== "data" || e.remainingLength < 8) return null;
	let n = X(e);
	e.skip(4);
	let r = q(e, t.contentSize - 8);
	switch (n) {
		case 1: return l.decode(r);
		case 2: return new TextDecoder("utf-16be").decode(r);
		case 13: return new Ze(r, "image/jpeg");
		case 14: return new Ze(r, "image/png");
		case 27: return new Ze(r, "image/bmp");
		default: return r;
	}
}, Or = /* @__PURE__ */ new Uint32Array(256), kr = /* @__PURE__ */ new Uint32Array(256), Ar = /* @__PURE__ */ new Uint32Array(256), jr = /* @__PURE__ */ new Uint32Array(256), Mr = /* @__PURE__ */ new Uint32Array(256), R = /* @__PURE__ */ new Uint32Array(256), Nr = /* @__PURE__ */ new Uint32Array(10), Pr = !1, Fr = () => {
	let e = /* @__PURE__ */ new Uint8Array(256), t = /* @__PURE__ */ new Uint8Array(256), n = /* @__PURE__ */ new Uint8Array(256);
	for (let e = 0, r = 1; e < 256; e++) n[e] = r, t[r] = e, r = r ^ r << 1 ^ (r & 128 ? 283 : 0);
	let r = (e, r) => e && r ? n[(t[e] + t[r]) % 255] : 0;
	e[0] = 99;
	for (let r = 1; r < 256; r++) {
		let i = n[255 - t[r]], a = i ^ i << 1 ^ i << 2 ^ i << 3 ^ i << 4;
		a = a >>> 8 ^ a & 255 ^ 99, e[r] = a;
	}
	for (let t = 0; t < 256; t++) {
		let n = e[t], i = e.indexOf(t);
		Or[t] = n << 24 | n << 16 | n << 8 | n, R[t] = i << 24 | i << 16 | i << 8 | i;
		let a = r(i, 14), o = r(i, 9), s = r(i, 13), c = r(i, 11), l = a << 24 | o << 16 | s << 8 | c;
		kr[t] = l, Ar[t] = l >>> 8 | l << 24, jr[t] = l >>> 16 | l << 16, Mr[t] = l >>> 24 | l << 8;
	}
	let i = 1;
	for (let e = 0; e < 10; e++) Nr[e] = i << 24, i = i << 1 ^ (i & 128 ? 283 : 0);
	Pr = !0;
}, Ir = class {
	constructor() {
		this.roundkey = /* @__PURE__ */ new Uint32Array(44), this.iv = new Uint32Array(16 / Uint32Array.BYTES_PER_ELEMENT), this.in = /* @__PURE__ */ new Uint8Array(16), this.out = /* @__PURE__ */ new Uint8Array(16), this.inView = new DataView(this.in.buffer), this.outView = new DataView(this.out.buffer);
	}
	init({ key: e, iv: n }) {
		t(e.byteLength === 16), t(n.byteLength === 16), Pr || Fr();
		let r = new DataView(e.buffer, e.byteOffset, e.byteLength), i = new DataView(n.buffer, n.byteOffset, n.byteLength);
		this.roundkey[0] = r.getUint32(0, !1), this.roundkey[1] = r.getUint32(4, !1), this.roundkey[2] = r.getUint32(8, !1), this.roundkey[3] = r.getUint32(12, !1), this.iv[0] = i.getUint32(0, !1), this.iv[1] = i.getUint32(4, !1), this.iv[2] = i.getUint32(8, !1), this.iv[3] = i.getUint32(12, !1);
		for (let e = 4; e < 44; e += 4) {
			let t = this.roundkey[e - 1];
			this.roundkey[e] = this.roundkey[e - 4] ^ Or[t >>> 16 & 255] & 4278190080 ^ Or[t >>> 8 & 255] & 16711680 ^ Or[t >>> 0 & 255] & 65280 ^ Or[t >>> 24 & 255] & 255 ^ Nr[e / 4 - 1], this.roundkey[e + 1] = this.roundkey[e - 3] ^ this.roundkey[e], this.roundkey[e + 2] = this.roundkey[e - 2] ^ this.roundkey[e + 1], this.roundkey[e + 3] = this.roundkey[e - 1] ^ this.roundkey[e + 2];
		}
		for (let e = 0, t = 40; e < t; e += 4, t -= 4) for (let n = 0; n < 4; n++) {
			let r = this.roundkey[e + n];
			this.roundkey[e + n] = this.roundkey[t + n], this.roundkey[t + n] = r;
		}
		for (let e = 4; e < 40; e += 4) for (let t = 0; t < 4; t++) {
			let n = this.roundkey[e + t];
			this.roundkey[e + t] = kr[Or[n >>> 24 & 255] & 255] ^ Ar[Or[n >>> 16 & 255] & 255] ^ jr[Or[n >>> 8 & 255] & 255] ^ Mr[Or[n >>> 0 & 255] & 255];
		}
	}
	decrypt() {
		let e = this.inView.getUint32(0, !1) ^ this.roundkey[0], t = this.inView.getUint32(4, !1) ^ this.roundkey[1], n = this.inView.getUint32(8, !1) ^ this.roundkey[2], r = this.inView.getUint32(12, !1) ^ this.roundkey[3], i = this.inView.getUint32(0, !1), a = this.inView.getUint32(4, !1), o = this.inView.getUint32(8, !1), s = this.inView.getUint32(12, !1), c, l, u, d;
		for (let i = 1; i < 10; i++) {
			let a = i * 4;
			c = kr[e >>> 24] ^ Ar[r >>> 16 & 255] ^ jr[n >>> 8 & 255] ^ Mr[t & 255] ^ this.roundkey[a], l = kr[t >>> 24] ^ Ar[e >>> 16 & 255] ^ jr[r >>> 8 & 255] ^ Mr[n & 255] ^ this.roundkey[a + 1], u = kr[n >>> 24] ^ Ar[t >>> 16 & 255] ^ jr[e >>> 8 & 255] ^ Mr[r & 255] ^ this.roundkey[a + 2], d = kr[r >>> 24] ^ Ar[n >>> 16 & 255] ^ jr[t >>> 8 & 255] ^ Mr[e & 255] ^ this.roundkey[a + 3], e = c, t = l, n = u, r = d;
		}
		let f = R[e >>> 24 & 255] & 4278190080 ^ R[r >>> 16 & 255] & 16711680 ^ R[n >>> 8 & 255] & 65280 ^ R[t >>> 0 & 255] & 255 ^ this.roundkey[40], p = R[t >>> 24 & 255] & 4278190080 ^ R[e >>> 16 & 255] & 16711680 ^ R[r >>> 8 & 255] & 65280 ^ R[n >>> 0 & 255] & 255 ^ this.roundkey[41], m = R[n >>> 24 & 255] & 4278190080 ^ R[t >>> 16 & 255] & 16711680 ^ R[e >>> 8 & 255] & 65280 ^ R[r >>> 0 & 255] & 255 ^ this.roundkey[42], h = R[r >>> 24 & 255] & 4278190080 ^ R[n >>> 16 & 255] & 16711680 ^ R[t >>> 8 & 255] & 65280 ^ R[e >>> 0 & 255] & 255 ^ this.roundkey[43];
		this.outView.setUint32(0, f ^ this.iv[0], !1), this.outView.setUint32(4, p ^ this.iv[1], !1), this.outView.setUint32(8, m ^ this.iv[2], !1), this.outView.setUint32(12, h ^ this.iv[3], !1), this.iv[0] = i, this.iv[1] = a, this.iv[2] = o, this.iv[3] = s;
	}
}, Lr = (e, t, n) => {
	let r = !1, i = 0, a = 2 ** 16, o = new Ir();
	return new ReadableStream({
		pull: async (s) => {
			r ||= (o.init(await t()), !0);
			let c = a + 16, l = e.requestSliceRange(i, 0, c);
			if (A(l) && (l = await l), !l || l.length === 0) throw Error("Invalid ciphertext.");
			let u = l.length;
			if (u % 16 != 0) throw Error("Invalid ciphertext.");
			let d = u === c ? u - 16 : u, f = q(l, d), p = new Uint8Array(d);
			for (let e = 0; e < d; e += 16) o.in.set(f.subarray(e, e + 16)), o.decrypt(), p.set(o.out, e);
			if (d < u) s.enqueue(p), i += d;
			else {
				let e = p[d - 1];
				if (e === 0 || e > 16) throw Error("Invalid PKCS#7 padding. Incorrect key or corrupted data.");
				let t = p.subarray(0, d - e);
				s.enqueue(t), s.close(), n();
			}
		},
		cancel: () => {
			n();
		}
	});
}, Rr = class e extends vr {
	constructor(e) {
		super(e), this.moovSlice = null, this.currentTrack = null, this.tracks = [], this.metadataPromise = null, this.movieTimescale = -1, this.movieDurationInTimescale = -1, this.isQuickTime = !1, this.metadataTags = {}, this.currentMetadataKeys = null, this.isFragmented = !1, this.fragmentTrackDefaults = [], this.psshBoxes = [], this.currentFragment = null, this.lastReadFragment = null, this.decryptionKeyCache = /* @__PURE__ */ new Map(), this.reader = e._reader;
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.tracks.map((e) => e.trackBacking);
	}
	async getMimeType() {
		await this.readMetadata();
		let e = await this.getTrackBackings(), t = await Promise.all(e.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)));
		return yr({
			isQuickTime: this.isQuickTime,
			hasVideo: this.tracks.some((e) => e.info?.type === "video"),
			hasAudio: this.tracks.some((e) => e.info?.type === "audio"),
			codecStrings: t.filter(Boolean)
		});
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
	readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = 0, n = !1, r = !1;
			for (;;) {
				let t = this.reader.requestSliceRange(e, 8, 16);
				if (A(t) && (t = await t), !t) break;
				let i = e, a = Sr(t);
				if (!a) break;
				if (a.name === "ftyp" || a.name === "styp") {
					let e = Q(t, 4);
					this.isQuickTime = e === "qt  ";
				} else if (a.name === "moov") {
					let e = this.reader.requestSlice(t.filePos, a.contentSize);
					if (A(e) && (e = await e), !e) break;
					this.moovSlice = e, this.readContiguousBoxes(this.moovSlice);
					for (let e of this.tracks) {
						let t = e.editListPreviousSegmentDurations / this.movieTimescale;
						e.editListOffset -= Math.round(t * e.timescale);
					}
					n = this.isFragmented && this.reader.fileSize !== null && this.reader.fileSize > i + a.totalSize, r = !0;
					break;
				} else if (a.name === "moof") {
					if (!this.input._initInput) throw Error("\"moof\" box encountered with no \"moov\" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a \"moov\" box is required to read this file, please provide it using InputOptions.initInput.");
					await this.copyMetadataFromInitInput(this.input._initInput), n = !1, r = !0;
					break;
				}
				e = i + a.totalSize;
			}
			if (!r && this.input._initInput && await this.copyMetadataFromInitInput(this.input._initInput), n) {
				t(this.reader.fileSize !== null);
				let e = this.reader.requestSlice(this.reader.fileSize - 4, 4);
				A(e) && (e = await e), t(e);
				let n = X(e), r = this.reader.fileSize - n;
				if (r >= 0 && r <= this.reader.fileSize - 16) {
					let e = this.reader.requestSliceRange(r, 8, 16);
					if (A(e) && (e = await e), e) {
						let t = Sr(e);
						if (t && t.name === "mfra") {
							let n = this.reader.requestSlice(e.filePos, t.contentSize);
							A(n) && (n = await n), n && this.readContiguousBoxes(n);
						}
					}
				}
			}
		})();
	}
	async copyMetadataFromInitInput(n) {
		let r = await n._getDemuxer();
		if (r.constructor !== e) throw Error("Init input must match the input's format.");
		await r.readMetadata(), this.movieTimescale = r.movieTimescale, this.movieDurationInTimescale = r.movieDurationInTimescale, this.metadataTags = r.metadataTags, this.isFragmented = !0, this.fragmentTrackDefaults = r.fragmentTrackDefaults, this.psshBoxes = r.psshBoxes;
		for (let e of r.tracks) {
			let n = {
				id: e.id,
				demuxer: this,
				trackBacking: null,
				disposition: e.disposition,
				timescale: e.timescale,
				durationInMediaTimescale: e.durationInMediaTimescale,
				durationInMovieTimescale: e.durationInMovieTimescale,
				rotation: e.rotation,
				internalCodecId: e.internalCodecId,
				name: e.name,
				languageCode: e.languageCode,
				sampleTableByteOffset: null,
				sampleTable: null,
				fragmentLookupTable: [],
				currentFragmentState: null,
				fragmentPositionCache: [],
				editListPreviousSegmentDurations: e.editListPreviousSegmentDurations,
				editListOffset: e.editListOffset,
				encryptionInfo: e.encryptionInfo,
				encryptionAuxInfo: null,
				frmaCodecString: null,
				info: e.info
			};
			e.trackBacking && (t(n.info), n.info.type === "video" && n.info.width !== -1 ? (n.trackBacking = new Br(n), this.tracks.push(n)) : n.info.type === "audio" && n.info.numberOfChannels !== -1 && (n.trackBacking = new Vr(n), this.tracks.push(n)));
		}
	}
	getSampleTableForTrack(e) {
		if (e.sampleTable) return e.sampleTable;
		let n = {
			sampleTimingEntries: [],
			sampleCompositionTimeOffsets: [],
			sampleSizes: [],
			keySampleIndices: null,
			chunkOffsets: [],
			sampleToChunk: [],
			presentationTimestamps: null,
			presentationTimestampIndexMap: null
		};
		if (e.sampleTable = n, e.sampleTableByteOffset === null) return n;
		t(this.moovSlice);
		let i = this.moovSlice.slice(e.sampleTableByteOffset);
		if (this.currentTrack = e, this.traverseBox(i), this.currentTrack = null, e.info?.type === "audio" && e.info.codec && An.includes(e.info.codec) && n.sampleCompositionTimeOffsets.length === 0) {
			t(e.info?.type === "audio");
			let i = Zn(e.info.codec), a = [], o = [];
			for (let t = 0; t < n.sampleToChunk.length; t++) {
				let s = n.sampleToChunk[t], c = n.sampleToChunk[t + 1], l = (c ? c.startChunkIndex : n.chunkOffsets.length) - s.startChunkIndex;
				for (let t = 0; t < l; t++) {
					let c = s.startSampleIndex + t * s.samplesPerChunk, l = c + s.samplesPerChunk, u = O(n.sampleTimingEntries, c, (e) => e.startIndex), d = n.sampleTimingEntries[u], f = O(n.sampleTimingEntries, l, (e) => e.startIndex), p = n.sampleTimingEntries[f], m = d.startDecodeTimestamp + (c - d.startIndex) * d.delta, h = p.startDecodeTimestamp + (l - p.startIndex) * p.delta - m, g = r(a);
					g && g.delta === h ? g.count++ : a.push({
						startIndex: s.startChunkIndex + t,
						startDecodeTimestamp: m,
						count: 1,
						delta: h
					});
					let _ = s.samplesPerChunk * i.sampleSize * e.info.numberOfChannels;
					o.push(_);
				}
				s.startSampleIndex = s.startChunkIndex, s.samplesPerChunk = 1;
			}
			n.sampleTimingEntries = a, n.sampleSizes = o;
		}
		if (n.sampleCompositionTimeOffsets.length > 0) {
			n.presentationTimestamps = [];
			for (let e of n.sampleTimingEntries) for (let t = 0; t < e.count; t++) n.presentationTimestamps.push({
				presentationTimestamp: e.startDecodeTimestamp + t * e.delta,
				sampleIndex: e.startIndex + t
			});
			for (let e of n.sampleCompositionTimeOffsets) for (let t = 0; t < e.count; t++) {
				let r = e.startIndex + t, i = n.presentationTimestamps[r];
				i && (i.presentationTimestamp += e.offset);
			}
			n.presentationTimestamps.sort((e, t) => e.presentationTimestamp - t.presentationTimestamp), n.presentationTimestampIndexMap = Array(n.presentationTimestamps.length).fill(-1);
			for (let e = 0; e < n.presentationTimestamps.length; e++) n.presentationTimestampIndexMap[n.presentationTimestamps[e].sampleIndex] = e;
		}
		return n;
	}
	async readFragment(e) {
		if (this.lastReadFragment?.moofOffset === e) return this.lastReadFragment;
		let n = this.reader.requestSliceRange(e, 8, 16);
		A(n) && (n = await n), t(n);
		let r = Sr(n);
		t(r?.name === "moof");
		let i = this.reader.requestSlice(e, r.totalSize);
		A(i) && (i = await i), t(i), this.traverseBox(i);
		let a = this.lastReadFragment;
		t(a && a.moofOffset === e);
		for (let [, e] of a.trackData) {
			let t = e.track, { fragmentPositionCache: n } = t;
			if (!e.startTimestampIsFinal) {
				let r = t.fragmentLookupTable.find((e) => e.moofOffset === a.moofOffset);
				if (r) Kr(e, r.timestamp);
				else {
					let t = O(n, a.moofOffset - 1, (e) => e.moofOffset);
					if (t !== -1) {
						let r = n[t];
						Kr(e, r.endTimestamp);
					}
				}
				e.startTimestampIsFinal = !0;
			}
			let r = O(n, e.startTimestamp, (e) => e.startTimestamp);
			if ((r === -1 || n[r].moofOffset !== a.moofOffset) && n.splice(r + 1, 0, {
				moofOffset: a.moofOffset,
				startTimestamp: e.startTimestamp,
				endTimestamp: e.endTimestamp
			}), e.encryptionAuxInfo && t.encryptionInfo) {
				let n = await Xr(this.reader, t.encryptionInfo, e.encryptionAuxInfo);
				for (let t = 0; t < Math.min(e.samples.length, n.length); t++) {
					let r = n[t];
					e.samples[t].encryption = r;
				}
			}
		}
		return a;
	}
	readContiguousBoxes(e) {
		let t = e.filePos;
		for (; e.filePos - t <= e.length - 8 && this.traverseBox(e););
	}
	*iterateContiguousBoxes(e) {
		let t = e.filePos;
		for (; e.filePos - t <= e.length - 8;) {
			let t = e.filePos, n = Sr(e);
			if (!n) break;
			yield {
				boxInfo: n,
				slice: e
			}, e.filePos = t + n.totalSize;
		}
	}
	traverseBox(e) {
		let i = e.filePos, a = Sr(e);
		if (!a) return !1;
		let o = e.filePos, s = i + a.totalSize;
		switch (a.name) {
			case "mdia":
			case "minf":
			case "dinf":
			case "mfra":
			case "edts":
			case "sinf":
			case "schi":
				this.readContiguousBoxes(e.slice(o, a.contentSize));
				break;
			case "mvhd":
				{
					let t = J(e);
					e.skip(3), t === 1 ? (e.skip(16), this.movieTimescale = X(e), this.movieDurationInTimescale = Z(e)) : (e.skip(8), this.movieTimescale = X(e), this.movieDurationInTimescale = X(e));
				}
				break;
			case "trak":
				{
					let t = {
						id: -1,
						demuxer: this,
						trackBacking: null,
						disposition: {
							...et,
							primary: !1
						},
						info: null,
						timescale: -1,
						durationInMovieTimescale: -1,
						durationInMediaTimescale: -1,
						rotation: 0,
						internalCodecId: null,
						name: null,
						languageCode: "und",
						sampleTableByteOffset: -1,
						sampleTable: null,
						fragmentLookupTable: [],
						currentFragmentState: null,
						fragmentPositionCache: [],
						editListPreviousSegmentDurations: 0,
						editListOffset: 0,
						encryptionInfo: null,
						encryptionAuxInfo: null,
						frmaCodecString: null
					};
					this.currentTrack = t, this.readContiguousBoxes(e.slice(o, a.contentSize)), t.id !== -1 && t.timescale !== -1 && t.info !== null && (t.info.type === "video" && t.info.width !== -1 ? (t.trackBacking = new Br(t), this.tracks.push(t)) : t.info.type === "audio" && t.info.numberOfChannels !== -1 && (t.trackBacking = new Vr(t), this.tracks.push(t))), this.currentTrack = null;
				}
				break;
			case "tkhd":
				{
					let r = this.currentTrack;
					if (!r) break;
					let i = J(e), a = !!(Xs(e) & 1);
					if (r.disposition.default = a, i === 0) e.skip(8), r.id = X(e), e.skip(4), r.durationInMovieTimescale = X(e);
					else if (i === 1) e.skip(16), r.id = X(e), e.skip(4), r.durationInMovieTimescale = Z(e);
					else throw Error(`Incorrect track header version ${i}.`);
					e.skip(16);
					let o = n(fe(qr([
						Cr(e),
						Cr(e),
						wr(e),
						Cr(e),
						Cr(e),
						wr(e),
						Cr(e),
						Cr(e),
						wr(e)
					]), 90));
					t(o === 0 || o === 90 || o === 180 || o === 270), r.rotation = o;
				}
				break;
			case "elst":
				{
					let t = this.currentTrack;
					if (!t) break;
					let n = J(e);
					e.skip(3);
					let r = !1, i = 0, a = X(e);
					for (let o = 0; o < a; o++) {
						let a = n === 1 ? Z(e) : X(e), o = n === 1 ? rc(e) : ec(e), s = Cr(e);
						if (a !== 0) {
							if (r) {
								j._warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");
								break;
							}
							if (o === -1) {
								i += a;
								continue;
							}
							if (s !== 1) {
								j._warn("Unsupported edit list entry: media rate must be 1.");
								break;
							}
							t.editListPreviousSegmentDurations = i, t.editListOffset = o, r = !0;
						}
					}
				}
				break;
			case "mdhd":
				{
					let t = this.currentTrack;
					if (!t) break;
					let n = J(e);
					e.skip(3), n === 0 ? (e.skip(8), t.timescale = X(e), t.durationInMediaTimescale = X(e)) : n === 1 && (e.skip(16), t.timescale = X(e), t.durationInMediaTimescale = Z(e));
					let r = Y(e);
					if (r > 0) {
						t.languageCode = "";
						for (let e = 0; e < 3; e++) t.languageCode = String.fromCharCode(96 + (r & 31)) + t.languageCode, r >>= 5;
						ye(t.languageCode) || (t.languageCode = "und");
					}
				}
				break;
			case "hdlr":
				{
					let t = this.currentTrack;
					if (!t) break;
					e.skip(8);
					let n = Q(e, 4);
					n === "vide" ? t.info = {
						type: "video",
						width: -1,
						height: -1,
						squarePixelWidth: -1,
						squarePixelHeight: -1,
						codec: null,
						codecDescription: null,
						colorSpace: { ...b },
						avcType: null,
						avcCodecInfo: null,
						hevcCodecInfo: null,
						vp9CodecInfo: null,
						av1CodecInfo: null,
						proresCodecInfo: null,
						proresFormat: null
					} : n === "soun" && (t.info = {
						type: "audio",
						numberOfChannels: -1,
						sampleRate: -1,
						codec: null,
						codecDescription: null,
						aacCodecInfo: null,
						dtsFormat: null,
						pcmLittleEndian: !1,
						pcmSampleSize: null
					});
				}
				break;
			case "stbl":
				{
					let t = this.currentTrack;
					if (!t) break;
					t.sampleTableByteOffset = i, this.readContiguousBoxes(e.slice(o, a.contentSize));
				}
				break;
			case "stsd":
				{
					let t = this.currentTrack;
					if (!t || t.info === null || t.sampleTable) break;
					let n = J(e);
					e.skip(3);
					let r = X(e);
					for (let i = 0; i < r; i++) {
						let r = e.filePos, i = Sr(e);
						if (!i) break;
						t.internalCodecId = i.name;
						let a = i.name.toLowerCase();
						if (t.info.type === "video") {
							e.skip(24), t.info.width = Y(e), t.info.height = Y(e), t.info.squarePixelWidth = t.info.width, t.info.squarePixelHeight = t.info.height, e.skip(50), t.frmaCodecString = null, this.readContiguousBoxes(e.slice(e.filePos, r + i.totalSize - e.filePos));
							let n = a === "encv" ? t.frmaCodecString : a;
							t.frmaCodecString = null, n === "avc1" || n === "avc3" ? (t.info.codec = "avc", t.info.avcType = n === "avc1" ? 1 : 3) : n === "hvc1" || n === "hev1" ? t.info.codec = "hevc" : n === "vp08" ? t.info.codec = "vp8" : n === "vp09" ? t.info.codec = "vp9" : n === "av01" ? t.info.codec = "av1" : Bn.includes(a) ? (t.info.codec = "prores", t.info.proresFormat = a) : n === null ? j._warn("Unknown encrypted video codec due to missing frma box.") : j._warn(`Unsupported video codec (sample entry type '${i.name}').`);
						} else {
							e.skip(8);
							let o = Y(e);
							e.skip(6);
							let s = Y(e), c = Y(e);
							e.skip(4);
							let l = X(e) / 65536, u = null;
							n === 0 && o > 0 && (o === 1 ? (e.skip(4), c = 8 * X(e), e.skip(8)) : o === 2 && (e.skip(4), l = oc(e), s = X(e), e.skip(4), c = X(e), u = X(e), e.skip(8))), t.info.numberOfChannels = s, t.info.sampleRate = l, t.frmaCodecString = null, this.readContiguousBoxes(e.slice(e.filePos, r + i.totalSize - e.filePos));
							let d = a === "enca" ? t.frmaCodecString : a;
							if (t.frmaCodecString = null, d !== "mp4a") {
								if (d === "opus") t.info.codec = "opus", t.info.sampleRate = Yn;
								else if (d === "flac") t.info.codec = "flac";
								else if (d === "ulaw") t.info.codec = "ulaw";
								else if (d === "alaw") t.info.codec = "alaw";
								else if (d === "ac-3") t.info.codec = "ac3";
								else if (d === "ec-3") t.info.codec = "eac3";
								else if (Vn.includes(d)) t.info.codec = "dts", t.info.dtsFormat = d;
								else if (d === "twos") c === 8 ? t.info.codec = "pcm-s8" : c === 16 ? t.info.codec = t.info.pcmLittleEndian ? "pcm-s16" : "pcm-s16be" : (j._warn(`Unsupported sample size ${c} for codec 'twos'.`), t.info.codec = null);
								else if (d === "sowt") c === 8 ? t.info.codec = "pcm-s8" : c === 16 ? t.info.codec = "pcm-s16" : (j._warn(`Unsupported sample size ${c} for codec 'sowt'.`), t.info.codec = null);
								else if (d === "raw ") t.info.codec = "pcm-u8";
								else if (d === "in24") t.info.codec = t.info.pcmLittleEndian ? "pcm-s24" : "pcm-s24be";
								else if (d === "in32") t.info.codec = t.info.pcmLittleEndian ? "pcm-s32" : "pcm-s32be";
								else if (d === "fl32") t.info.codec = t.info.pcmLittleEndian ? "pcm-f32" : "pcm-f32be";
								else if (d === "fl64") t.info.codec = t.info.pcmLittleEndian ? "pcm-f64" : "pcm-f64be";
								else if (d === "ipcm") {
									let e = t.info.pcmSampleSize;
									t.info.pcmLittleEndian ? e === 16 ? t.info.codec = "pcm-s16" : e === 24 ? t.info.codec = "pcm-s24" : e === 32 ? t.info.codec = "pcm-s32" : (j._warn(`Invalid ipcm sample size ${e}.`), t.info.codec = null) : e === 16 ? t.info.codec = "pcm-s16be" : e === 24 ? t.info.codec = "pcm-s24be" : e === 32 ? t.info.codec = "pcm-s32be" : (j._warn(`Invalid ipcm sample size ${e}.`), t.info.codec = null);
								} else if (d === "fpcm") {
									let e = t.info.pcmSampleSize;
									t.info.pcmLittleEndian ? e === 32 ? t.info.codec = "pcm-f32" : e === 64 ? t.info.codec = "pcm-f64" : (j._warn(`Invalid fpcm sample size ${e}.`), t.info.codec = null) : e === 32 ? t.info.codec = "pcm-f32be" : e === 64 ? t.info.codec = "pcm-f64be" : (j._warn(`Invalid fpcm sample size ${e}.`), t.info.codec = null);
								} else if (d === "lpcm" && u !== null) {
									let e = c + 7 >> 3, n = !!(u & 1), r = !!(u & 2), i = u & 4 ? -1 : 0;
									c > 0 && c <= 64 && (n ? c === 32 && (t.info.codec = r ? "pcm-f32be" : "pcm-f32") : i & 1 << e - 1 ? e === 1 ? t.info.codec = "pcm-s8" : e === 2 ? t.info.codec = r ? "pcm-s16be" : "pcm-s16" : e === 3 ? t.info.codec = r ? "pcm-s24be" : "pcm-s24" : e === 4 && (t.info.codec = r ? "pcm-s32be" : "pcm-s32") : e === 1 && (t.info.codec = "pcm-u8")), t.info.codec === null && j._warn("Unsupported PCM format.");
								} else d === null ? j._warn("Unknown encrypted audio codec due to missing frma box.") : j._warn(`Unsupported audio codec (sample entry type '${i.name}').`);
							}
						}
						e.filePos = r + i.totalSize;
					}
				}
				break;
			case "frma":
				{
					let t = this.currentTrack;
					if (!t) break;
					t.frmaCodecString = Q(e, 4).toLowerCase();
				}
				break;
			case "schm":
				{
					let t = this.currentTrack;
					if (!t) break;
					e.skip(4);
					let n = Q(e, 4);
					n === "cenc" || n === "cens" || n === "cbcs" ? t.encryptionInfo = {
						scheme: n,
						defaultKid: null,
						defaultIsProtected: null,
						defaultPerSampleIvSize: null,
						defaultConstantIv: null,
						defaultCryptByteBlock: null,
						defaultSkipByteBlock: null
					} : j._warn(`Unsupported encryption scheme '${n}'.`);
				}
				break;
			case "tenc":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					let n = J(e);
					e.skip(3), e.skip(1);
					let r = J(e);
					if (n > 0 ? (t.encryptionInfo.defaultCryptByteBlock = r >> 4, t.encryptionInfo.defaultSkipByteBlock = r & 15) : (t.encryptionInfo.defaultCryptByteBlock = 0, t.encryptionInfo.defaultSkipByteBlock = 0), t.encryptionInfo.defaultIsProtected = J(e) !== 0, t.encryptionInfo.defaultPerSampleIvSize = J(e), t.encryptionInfo.defaultKid = w(q(e, 16)), t.encryptionInfo.defaultIsProtected && t.encryptionInfo.defaultPerSampleIvSize === 0) {
						let n = J(e), r = /* @__PURE__ */ new Uint8Array(16);
						r.set(q(e, n), 0), t.encryptionInfo.defaultConstantIv = r;
					}
				}
				break;
			case "avcC":
				{
					let n = this.currentTrack;
					if (!n || (t(n.info), a.contentSize === 0)) break;
					n.info.codecDescription = q(e, a.contentSize);
				}
				break;
			case "hvcC":
				{
					let n = this.currentTrack;
					if (!n || (t(n.info), a.contentSize === 0)) break;
					n.info.codecDescription = q(e, a.contentSize);
				}
				break;
			case "vpcC":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "video"), e.skip(4);
					let r = J(e), i = J(e), a = J(e), o = a >> 4, s = a >> 1 & 7, c = a & 1, l = J(e), u = J(e), d = J(e);
					n.info.vp9CodecInfo = {
						profile: r,
						level: i,
						bitDepth: o,
						chromaSubsampling: s,
						videoFullRangeFlag: c,
						colourPrimaries: l,
						transferCharacteristics: u,
						matrixCoefficients: d
					};
				}
				break;
			case "av1C":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "video"), e.skip(1);
					let r = J(e), i = r >> 5, o = r & 31, s = J(e), c = s >> 7, l = s >> 6 & 1, u = s >> 5 & 1, d = s >> 4 & 1, f = s >> 3 & 1, p = s >> 2 & 1, m = s & 3, h = i === 2 && l ? u ? 12 : 10 : l ? 10 : 8;
					e.skip(1);
					let g = Gt(q(e, a.contentSize - 4));
					n.info.av1CodecInfo = {
						profile: i,
						level: o,
						tier: c,
						bitDepth: h,
						monochrome: d,
						chromaSubsamplingX: f,
						chromaSubsamplingY: p,
						chromaSamplePosition: m,
						videoFullRangeFlag: g?.videoFullRangeFlag ?? 0,
						colourPrimaries: g?.colourPrimaries ?? 2,
						transferCharacteristics: g?.transferCharacteristics ?? 2,
						matrixCoefficients: g?.matrixCoefficients ?? 2
					};
				}
				break;
			case "colr":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "video");
					let r = Q(e, 4);
					if (r !== "nclx" && r !== "nclc") break;
					let i = Y(e), a = Y(e), o = Y(e), s;
					r === "nclx" && (s = !!(J(e) & 128)), n.info.colorSpace = {
						primaries: p[i],
						transfer: h[a],
						matrix: _[o],
						fullRange: s
					};
				}
				break;
			case "pasp":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "video");
					let r = X(e), i = X(e);
					r > 0 && i > 0 && (r > i ? n.info.squarePixelWidth = Math.round(n.info.width * r / i) : n.info.squarePixelHeight = Math.round(n.info.height * i / r));
				}
				break;
			case "wave":
				this.readContiguousBoxes(e.slice(o, a.contentSize));
				break;
			case "esds":
				{
					let n = this.currentTrack;
					if (!n || n.info?.type !== "audio") break;
					e.skip(4), t(J(e) === 3), Tr(e), e.skip(2);
					let r = J(e), i = !!(r & 128), a = !!(r & 64), o = !!(r & 32);
					if (i && e.skip(2), a) {
						let t = J(e);
						e.skip(t);
					}
					o && e.skip(2), t(J(e) === 4);
					let s = Tr(e), c = e.filePos, l = J(e);
					if (l === 64 || l === 103 ? (n.info.codec = "aac", n.info.aacCodecInfo = {
						isMpeg2: l === 103,
						objectType: null
					}) : l === 105 || l === 107 ? n.info.codec = "mp3" : l === 221 ? n.info.codec = "vorbis" : l === 169 ? n.info.codec = "dts" : j._warn(`Unsupported audio codec (objectTypeIndication ${l}) - discarding track.`), e.skip(12), s > e.filePos - c) {
						t(J(e) === 5);
						let r = Tr(e);
						if (n.info.codecDescription = q(e, r), n.info.codec === "aac") {
							let e = it(n.info.codecDescription);
							e.outputNumberOfChannels !== null && (n.info.numberOfChannels = e.outputNumberOfChannels), e.outputSampleRate !== null && (n.info.sampleRate = e.outputSampleRate);
						}
					}
				}
				break;
			case "enda":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio"), n.info.pcmLittleEndian = !!(Y(e) & 255);
				}
				break;
			case "pcmC":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio"), e.skip(4);
					let r = J(e);
					n.info.pcmLittleEndian = !!(r & 1), n.info.pcmSampleSize = J(e);
				}
				break;
			case "dOps":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio"), e.skip(1);
					let r = J(e), i = Y(e), a = X(e), o = Zs(e), s = J(e), c;
					c = s === 0 ? /* @__PURE__ */ new Uint8Array() : q(e, 2 + r);
					let l = new Uint8Array(19 + c.byteLength), u = new DataView(l.buffer);
					u.setUint32(0, 1332770163, !1), u.setUint32(4, 1214603620, !1), u.setUint8(8, 1), u.setUint8(9, r), u.setUint16(10, i, !0), u.setUint32(12, a, !0), u.setInt16(16, o, !0), u.setUint8(18, s), l.set(c, 19), n.info.codecDescription = l, n.info.numberOfChannels = r;
				}
				break;
			case "dfLa":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio"), e.skip(4);
					let r = e.filePos;
					for (; e.filePos < s;) {
						let t = J(e), r = Xs(e);
						if ((t & 127) === $t.STREAMINFO) {
							e.skip(10);
							let t = X(e), r = t >>> 12, i = (t >> 9 & 7) + 1;
							n.info.sampleRate = r, n.info.numberOfChannels = i, e.skip(20);
						} else e.skip(r);
						if (t & 128) break;
					}
					let i = e.filePos;
					e.filePos = r;
					let a = q(e, i - r), o = new Uint8Array(4 + a.byteLength);
					new DataView(o.buffer).setUint32(0, 1716281667, !1), o.set(a, 4), n.info.codecDescription = o;
				}
				break;
			case "dac3":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio");
					let r = new M(q(e, 3)), i = r.readBits(2);
					r.skipBits(8);
					let a = r.readBits(3), o = r.readBits(1);
					i < 3 && (n.info.sampleRate = dt[i]), n.info.numberOfChannels = tn[a] + o;
				}
				break;
			case "dec3":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio");
					let r = cn(q(e, a.contentSize));
					if (!r) {
						j._warn("Invalid dec3 box contents, ignoring.");
						break;
					}
					let i = ln(r);
					i !== null && (n.info.sampleRate = i), n.info.numberOfChannels = un(r);
				}
				break;
			case "ddts":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.info?.type === "audio");
					let r = Dn(q(e, Math.min(a.contentSize, 20)));
					if (!r) {
						j._warn("Invalid ddts box contents, ignoring.");
						break;
					}
					n.info.sampleRate = r.sampleRate, r.numberOfChannels !== null && (n.info.numberOfChannels = r.numberOfChannels);
				}
				break;
			case "stts":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = X(e), r = 0, i = 0;
					for (let a = 0; a < n; a++) {
						let n = X(e), a = X(e);
						t.sampleTable.sampleTimingEntries.push({
							startIndex: r,
							startDecodeTimestamp: i,
							count: n,
							delta: a
						}), r += n, i += n * a;
					}
				}
				break;
			case "ctts":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = X(e), r = 0;
					for (let i = 0; i < n; i++) {
						let n = X(e), i = ec(e);
						t.sampleTable.sampleCompositionTimeOffsets.push({
							startIndex: r,
							count: n,
							offset: i
						}), r += n;
					}
				}
				break;
			case "stsz":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = X(e), r = X(e);
					if (n === 0) for (let n = 0; n < r; n++) {
						let n = X(e);
						t.sampleTable.sampleSizes.push(n);
					}
					else t.sampleTable.sampleSizes.push(n);
				}
				break;
			case "stz2":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4), e.skip(3);
					let n = J(e), r = X(e), i = new M(q(e, Math.ceil(r * n / 8)));
					for (let e = 0; e < r; e++) {
						let e = i.readBits(n);
						t.sampleTable.sampleSizes.push(e);
					}
				}
				break;
			case "stss":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4), t.sampleTable.keySampleIndices = [];
					let n = X(e);
					for (let r = 0; r < n; r++) {
						let n = X(e) - 1;
						t.sampleTable.keySampleIndices.push(n);
					}
					t.sampleTable.keySampleIndices[0] !== 0 && t.sampleTable.keySampleIndices.unshift(0);
				}
				break;
			case "stsc":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = X(e);
					for (let r = 0; r < n; r++) {
						let n = X(e) - 1, r = X(e), i = X(e);
						t.sampleTable.sampleToChunk.push({
							startSampleIndex: -1,
							startChunkIndex: n,
							samplesPerChunk: r,
							sampleDescriptionIndex: i
						});
					}
					let r = 0;
					for (let e = 0; e < t.sampleTable.sampleToChunk.length; e++) if (t.sampleTable.sampleToChunk[e].startSampleIndex = r, e < t.sampleTable.sampleToChunk.length - 1) {
						let n = t.sampleTable.sampleToChunk[e + 1].startChunkIndex - t.sampleTable.sampleToChunk[e].startChunkIndex;
						r += n * t.sampleTable.sampleToChunk[e].samplesPerChunk;
					}
				}
				break;
			case "stco":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = X(e);
					for (let r = 0; r < n; r++) {
						let n = X(e);
						t.sampleTable.chunkOffsets.push(n);
					}
				}
				break;
			case "co64":
				{
					let t = this.currentTrack;
					if (!t || !t.sampleTable) break;
					e.skip(4);
					let n = X(e);
					for (let r = 0; r < n; r++) {
						let n = Z(e);
						t.sampleTable.chunkOffsets.push(n);
					}
				}
				break;
			case "mvex":
				this.isFragmented = !0, this.readContiguousBoxes(e.slice(o, a.contentSize));
				break;
			case "mehd":
				{
					let t = J(e);
					e.skip(3);
					let n = t === 1 ? Z(e) : X(e);
					this.movieDurationInTimescale = n;
				}
				break;
			case "trex":
				{
					e.skip(4);
					let t = X(e), n = X(e), r = X(e), i = X(e), a = X(e);
					this.fragmentTrackDefaults.push({
						trackId: t,
						defaultSampleDescriptionIndex: n,
						defaultSampleDuration: r,
						defaultSampleSize: i,
						defaultSampleFlags: a
					});
				}
				break;
			case "tfra":
				{
					let t = J(e);
					e.skip(3);
					let n = X(e), r = this.tracks.find((e) => e.id === n);
					if (!r) break;
					let i = X(e), a = (i & 48) >> 4, o = (i & 12) >> 2, s = i & 3, c = [
						J,
						Y,
						Xs,
						X
					], l = c[a], u = c[o], d = c[s], f = X(e);
					for (let n = 0; n < f; n++) {
						let n = t === 1 ? Z(e) : X(e), i = t === 1 ? Z(e) : X(e);
						l(e), u(e), d(e), r.fragmentLookupTable.push({
							timestamp: n,
							moofOffset: i
						});
					}
					r.fragmentLookupTable.sort((e, t) => e.timestamp - t.timestamp);
					for (let e = 0; e < r.fragmentLookupTable.length - 1; e++) {
						let t = r.fragmentLookupTable[e], n = r.fragmentLookupTable[e + 1];
						t.timestamp === n.timestamp && (r.fragmentLookupTable.splice(e + 1, 1), e--);
					}
				}
				break;
			case "moof":
				this.currentFragment = {
					moofOffset: i,
					moofSize: a.totalSize,
					implicitBaseDataOffset: i,
					trackData: /* @__PURE__ */ new Map(),
					psshBoxes: []
				}, this.readContiguousBoxes(e.slice(o, a.contentSize)), this.lastReadFragment = this.currentFragment, this.currentFragment = null;
				break;
			case "traf":
				if (t(this.currentFragment), this.readContiguousBoxes(e.slice(o, a.contentSize)), this.currentTrack) {
					let e = this.currentFragment.trackData.get(this.currentTrack.id);
					cond: if (e) {
						if (e.samples.length === 0) {
							this.currentFragment.trackData.delete(this.currentTrack.id);
							break cond;
						}
						e.presentationTimestamps = e.samples.map((e, t) => ({
							presentationTimestamp: e.presentationTimestamp,
							sampleIndex: t
						})).sort((e, t) => e.presentationTimestamp - t.presentationTimestamp);
						for (let t = 0; t < e.presentationTimestamps.length; t++) {
							let n = e.presentationTimestamps[t], r = e.samples[n.sampleIndex];
							e.firstKeyFrameTimestamp === null && r.isKeyFrame && (e.firstKeyFrameTimestamp = r.presentationTimestamp), t < e.presentationTimestamps.length - 1 && (r.duration = e.presentationTimestamps[t + 1].presentationTimestamp - n.presentationTimestamp);
						}
						let n = e.samples[e.presentationTimestamps[0].sampleIndex], i = e.samples[r(e.presentationTimestamps).sampleIndex];
						e.startTimestamp = n.presentationTimestamp, e.endTimestamp = i.presentationTimestamp + i.duration;
						let { currentFragmentState: a } = this.currentTrack;
						t(a), a.startTimestamp !== null && (Kr(e, a.startTimestamp), e.startTimestampIsFinal = !0), a.encryptionAuxInfo && !e.samples[0].encryption && (e.encryptionAuxInfo = a.encryptionAuxInfo);
					}
					this.currentTrack.currentFragmentState = null, this.currentTrack = null;
				}
				break;
			case "pssh":
				{
					if (this.input._formatOptions.isobmff?._suppressPsshParsing) break;
					let t = br(q(e, a.contentSize));
					this.currentFragment ? this.currentFragment.psshBoxes.push(t) : this.currentTrack || this.psshBoxes.push(t);
				}
				break;
			case "tfhd":
				{
					t(this.currentFragment), e.skip(1);
					let n = Xs(e), r = !!(n & 1), i = !!(n & 2), a = !!(n & 8), o = !!(n & 16), s = !!(n & 32), c = !!(n & 65536), l = !!(n & 131072), u = X(e), d = this.tracks.find((e) => e.id === u);
					if (!d) break;
					let f = this.fragmentTrackDefaults.find((e) => e.trackId === u);
					this.currentTrack = d, d.currentFragmentState = {
						baseDataOffset: this.currentFragment.implicitBaseDataOffset,
						sampleDescriptionIndex: f?.defaultSampleDescriptionIndex ?? null,
						defaultSampleDuration: f?.defaultSampleDuration ?? null,
						defaultSampleSize: f?.defaultSampleSize ?? null,
						defaultSampleFlags: f?.defaultSampleFlags ?? null,
						startTimestamp: null,
						encryptionAuxInfo: null
					}, r ? d.currentFragmentState.baseDataOffset = Z(e) : l && (d.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset), i && (d.currentFragmentState.sampleDescriptionIndex = X(e)), a && (d.currentFragmentState.defaultSampleDuration = X(e)), o && (d.currentFragmentState.defaultSampleSize = X(e)), s && (d.currentFragmentState.defaultSampleFlags = X(e)), c && (d.currentFragmentState.defaultSampleDuration = 0);
				}
				break;
			case "tfdt":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(n.currentFragmentState);
					let r = J(e);
					e.skip(3);
					let i = r === 0 ? X(e) : Z(e);
					n.currentFragmentState.startTimestamp = i;
				}
				break;
			case "trun":
				{
					let n = this.currentTrack;
					if (!n) break;
					t(this.currentFragment), t(n.currentFragmentState);
					let r = J(e), i = Xs(e), a = !!(i & 1), o = !!(i & 4), s = !!(i & 256), c = !!(i & 512), l = !!(i & 1024), u = !!(i & 2048), d = X(e), f = null;
					a && (f = ec(e));
					let p = null;
					o && (p = X(e));
					let m;
					this.currentFragment.trackData.has(n.id) ? (m = this.currentFragment.trackData.get(n.id), f !== null && (m.currentOffset = n.currentFragmentState.baseDataOffset + f)) : (m = {
						track: n,
						currentTimestamp: 0,
						currentOffset: n.currentFragmentState.baseDataOffset + (f ?? 0),
						startTimestamp: 0,
						endTimestamp: 0,
						firstKeyFrameTimestamp: null,
						samples: [],
						presentationTimestamps: [],
						startTimestampIsFinal: !1,
						encryptionAuxInfo: null
					}, this.currentFragment.trackData.set(n.id, m));
					for (let i = 0; i < d; i++) {
						let a;
						s ? a = X(e) : (t(n.currentFragmentState.defaultSampleDuration !== null), a = n.currentFragmentState.defaultSampleDuration);
						let o;
						c ? o = X(e) : (t(n.currentFragmentState.defaultSampleSize !== null), o = n.currentFragmentState.defaultSampleSize);
						let d;
						l ? d = X(e) : (t(n.currentFragmentState.defaultSampleFlags !== null), d = n.currentFragmentState.defaultSampleFlags), i === 0 && p !== null && (d = p);
						let f = 0;
						u && (f = r === 0 ? X(e) : ec(e));
						let h = !(d & 65536);
						m.samples.push({
							presentationTimestamp: m.currentTimestamp + f,
							duration: a,
							byteOffset: m.currentOffset,
							byteSize: o,
							isKeyFrame: h,
							encryption: null
						}), m.currentOffset += o, m.currentTimestamp += a;
					}
					this.currentFragment.implicitBaseDataOffset = m.currentOffset;
				}
				break;
			case "saiz":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					if (e.skip(1), Xs(e) & 1) {
						let n = Q(e, 4), r = X(e);
						if (n !== t.encryptionInfo.scheme || r !== 0) break;
					}
					let n = J(e), r = X(e), i = null;
					n === 0 && r > 0 && (i = q(e, r));
					let a = Yr(t);
					a.defaultSampleInfoSize = n, a.sampleSizes = i, a.sampleCount = r;
				}
				break;
			case "saio":
				{
					let t = this.currentTrack;
					if (!t || !t.encryptionInfo) break;
					let n = J(e);
					if (Xs(e) & 1) {
						let n = Q(e, 4), r = X(e);
						if (n !== t.encryptionInfo.scheme || r !== 0) break;
					}
					let r = X(e);
					if (r === 0) break;
					r > 1 && j._warn("Multiple saio entries are not supported; using the first offset only.");
					let i = n === 0 ? X(e) : Number(Z(e));
					this.currentFragment && (i += this.currentFragment.moofOffset);
					let a = Yr(t);
					a.offset = i;
				}
				break;
			case "senc":
				{
					let n = this.currentTrack;
					if (!n || !n.encryptionInfo) break;
					t(this.currentFragment);
					let r = this.currentFragment.trackData.get(n.id);
					if (!r) break;
					e.skip(1);
					let i = !!(Xs(e) & 2), a = X(e), o = n.encryptionInfo.defaultPerSampleIvSize;
					t(o !== null);
					for (let t = 0; t < Math.min(a, r.samples.length); t++) {
						let a = /* @__PURE__ */ new Uint8Array(16);
						o > 0 ? a.set(q(e, o), 0) : a.set(n.encryptionInfo.defaultConstantIv, 0);
						let s = null;
						if (i) {
							let t = Y(e);
							s = [];
							for (let n = 0; n < t; n++) {
								let t = Y(e), n = X(e);
								s.push({
									clearLen: t,
									protectedLen: n
								});
							}
						}
						let c = r.samples[t];
						c.encryption = {
							iv: a,
							subsamples: s
						};
					}
				}
				break;
			case "udta":
				{
					let t = this.iterateContiguousBoxes(e.slice(o, a.contentSize));
					for (let { boxInfo: e, slice: n } of t) {
						if (e.name !== "meta" && !this.currentTrack) {
							let t = n.filePos;
							this.metadataTags.raw ??= {}, e.name[0] === "©" ? this.metadataTags.raw[e.name] ??= Er(n) : this.metadataTags.raw[e.name] ??= q(n, e.contentSize), n.filePos = t;
						}
						switch (e.name) {
							case "meta":
								n.skip(-e.headerSize), this.traverseBox(n);
								break;
							case "©nam":
							case "name":
								this.currentTrack ? this.currentTrack.name = l.decode(q(n, e.contentSize)) : this.metadataTags.title ??= Er(n);
								break;
							case "©des":
								this.currentTrack || (this.metadataTags.description ??= Er(n));
								break;
							case "©ART":
								this.currentTrack || (this.metadataTags.artist ??= Er(n));
								break;
							case "©alb":
								this.currentTrack || (this.metadataTags.album ??= Er(n));
								break;
							case "albr":
								this.currentTrack || (this.metadataTags.albumArtist ??= Er(n));
								break;
							case "©gen":
								this.currentTrack || (this.metadataTags.genre ??= Er(n));
								break;
							case "©day":
								if (!this.currentTrack) {
									let e = new Date(Er(n));
									Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
								}
								break;
							case "©cmt":
								this.currentTrack || (this.metadataTags.comment ??= Er(n));
								break;
							case "©lyr": this.currentTrack || (this.metadataTags.lyrics ??= Er(n));
						}
					}
				}
				break;
			case "meta":
				{
					if (this.currentTrack) break;
					let t = X(e) !== 0;
					this.currentMetadataKeys = /* @__PURE__ */ new Map(), t ? this.readContiguousBoxes(e.slice(o, a.contentSize)) : this.readContiguousBoxes(e.slice(o + 4, a.contentSize - 4)), this.currentMetadataKeys = null;
				}
				break;
			case "keys":
				{
					if (!this.currentMetadataKeys) break;
					e.skip(4);
					let t = X(e);
					for (let n = 0; n < t; n++) {
						let t = X(e);
						e.skip(4);
						let r = l.decode(q(e, t - 8));
						this.currentMetadataKeys.set(n + 1, r);
					}
				}
				break;
			case "ilst": {
				if (!this.currentMetadataKeys) break;
				let t = this.iterateContiguousBoxes(e.slice(o, a.contentSize));
				for (let { boxInfo: e, slice: n } of t) {
					let t = e.name, r = (t.charCodeAt(0) << 24) + (t.charCodeAt(1) << 16) + (t.charCodeAt(2) << 8) + t.charCodeAt(3);
					this.currentMetadataKeys.has(r) && (t = this.currentMetadataKeys.get(r));
					let i = Dr(n);
					switch (this.metadataTags.raw ??= {}, this.metadataTags.raw[t] ??= i, t) {
						case "©nam":
						case "titl":
						case "com.apple.quicktime.title":
						case "title":
							typeof i == "string" && (this.metadataTags.title ??= i);
							break;
						case "©des":
						case "desc":
						case "dscp":
						case "com.apple.quicktime.description":
						case "description":
							typeof i == "string" && (this.metadataTags.description ??= i);
							break;
						case "©ART":
						case "com.apple.quicktime.artist":
						case "artist":
							typeof i == "string" && (this.metadataTags.artist ??= i);
							break;
						case "©alb":
						case "albm":
						case "com.apple.quicktime.album":
						case "album":
							typeof i == "string" && (this.metadataTags.album ??= i);
							break;
						case "aART":
						case "album_artist":
							typeof i == "string" && (this.metadataTags.albumArtist ??= i);
							break;
						case "©cmt":
						case "com.apple.quicktime.comment":
						case "comment":
							typeof i == "string" && (this.metadataTags.comment ??= i);
							break;
						case "©gen":
						case "gnre":
						case "com.apple.quicktime.genre":
						case "genre":
							typeof i == "string" && (this.metadataTags.genre ??= i);
							break;
						case "©lyr":
						case "lyrics":
							typeof i == "string" && (this.metadataTags.lyrics ??= i);
							break;
						case "©day":
						case "rldt":
						case "com.apple.quicktime.creationdate":
						case "date":
							if (typeof i == "string") {
								let e = new Date(i);
								Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
							}
							break;
						case "covr":
						case "com.apple.quicktime.artwork":
							i instanceof Ze ? (this.metadataTags.images ??= [], this.metadataTags.images.push({
								data: i.data,
								kind: "coverFront",
								mimeType: i.mimeType
							})) : i instanceof Uint8Array && (this.metadataTags.images ??= [], this.metadataTags.images.push({
								data: i,
								kind: "coverFront",
								mimeType: "image/*"
							}));
							break;
						case "track":
							if (typeof i == "string") {
								let e = i.split("/"), t = Number.parseInt(e[0], 10), n = e[1] && Number.parseInt(e[1], 10);
								Number.isInteger(t) && t > 0 && (this.metadataTags.trackNumber ??= t), n && Number.isInteger(n) && n > 0 && (this.metadataTags.tracksTotal ??= n);
							}
							break;
						case "trkn":
							if (i instanceof Uint8Array && i.length >= 6) {
								let e = c(i), t = e.getUint16(2, !1), n = e.getUint16(4, !1);
								t > 0 && (this.metadataTags.trackNumber ??= t), n > 0 && (this.metadataTags.tracksTotal ??= n);
							}
							break;
						case "disc":
						case "disk": if (i instanceof Uint8Array && i.length >= 6) {
							let e = c(i), t = e.getUint16(2, !1), n = e.getUint16(4, !1);
							t > 0 && (this.metadataTags.discNumber ??= t), n > 0 && (this.metadataTags.discsTotal ??= n);
						}
					}
				}
			}
		}
		return e.filePos = s, !0;
	}
}, zr = class {
	constructor(e) {
		this.internalTrack = e, this.packetToSampleIndex = /* @__PURE__ */ new WeakMap(), this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
	}
	getId() {
		return this.internalTrack.id;
	}
	getNumber() {
		let e = this.internalTrack.demuxer, t = this.internalTrack.trackBacking.getType(), n = 0;
		for (let r of e.tracks) if (r.trackBacking.getType() === t && n++, r === this.internalTrack) break;
		return n;
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getInternalCodecId() {
		return this.internalTrack.internalCodecId;
	}
	getName() {
		return this.internalTrack.name;
	}
	getLanguageCode() {
		return this.internalTrack.languageCode;
	}
	getTimeResolution() {
		return this.internalTrack.timescale;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getDisposition() {
		return this.internalTrack.disposition;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		let e = this.internalTrack;
		return e.durationInMediaTimescale <= 0 ? null : (t(e.trackBacking), ((await e.trackBacking.getFirstPacket({ metadataOnly: !0 }))?.timestamp ?? 0) + e.durationInMediaTimescale / e.timescale);
	}
	async getLiveRefreshInterval() {
		return null;
	}
	async getFirstPacket(e) {
		let t = await this.fetchPacketForSampleIndex(0, e);
		return t || !this.internalTrack.demuxer.isFragmented ? t : this.performFragmentedLookup(null, (e) => e.trackData.get(this.internalTrack.id) ? {
			sampleIndex: 0,
			correctSampleFound: !0
		} : {
			sampleIndex: -1,
			correctSampleFound: !1
		}, -Infinity, Infinity, e);
	}
	mapTimestampIntoTimescale(e) {
		return de(e * this.internalTrack.timescale) + this.internalTrack.editListOffset;
	}
	async getPacket(e, t) {
		let n = this.mapTimestampIntoTimescale(e), r = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), i = Hr(r, n), a = await this.fetchPacketForSampleIndex(i, t);
		return !Jr(r) || !this.internalTrack.demuxer.isFragmented ? a : this.performFragmentedLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
			let r = O(t.presentationTimestamps, n, (e) => e.presentationTimestamp);
			return {
				sampleIndex: r === -1 ? -1 : t.presentationTimestamps[r].sampleIndex,
				correctSampleFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextPacket(e, t) {
		let n = this.packetToSampleIndex.get(e);
		if (n !== void 0) return this.fetchPacketForSampleIndex(n + 1, t);
		let r = this.packetToFragmentLocation.get(e);
		if (r === void 0) throw Error("Packet was not created from this track.");
		return this.performFragmentedLookup(r.fragment, (e) => {
			if (e === r.fragment) {
				let t = e.trackData.get(this.internalTrack.id);
				if (r.sampleIndex + 1 < t.samples.length) return {
					sampleIndex: r.sampleIndex + 1,
					correctSampleFound: !0
				};
			} else if (e.trackData.get(this.internalTrack.id)) return {
				sampleIndex: 0,
				correctSampleFound: !0
			};
			return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
		}, -Infinity, Infinity, t);
	}
	async getKeyPacket(e, t) {
		let n = this.mapTimestampIntoTimescale(e), r = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), i = Ur(r, n), a = await this.fetchPacketForSampleIndex(i, t);
		return !Jr(r) || !this.internalTrack.demuxer.isFragmented ? a : this.performFragmentedLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
			let r = re(t.presentationTimestamps, (e) => t.samples[e.sampleIndex].isKeyFrame && e.presentationTimestamp <= n);
			return {
				sampleIndex: r === -1 ? -1 : t.presentationTimestamps[r].sampleIndex,
				correctSampleFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextKeyPacket(e, n) {
		let r = this.packetToSampleIndex.get(e);
		if (r !== void 0) {
			let e = Gr(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), r);
			return this.fetchPacketForSampleIndex(e, n);
		}
		let i = this.packetToFragmentLocation.get(e);
		if (i === void 0) throw Error("Packet was not created from this track.");
		return this.performFragmentedLookup(i.fragment, (e) => {
			if (e === i.fragment) {
				let t = e.trackData.get(this.internalTrack.id).samples.findIndex((e, t) => e.isKeyFrame && t > i.sampleIndex);
				if (t !== -1) return {
					sampleIndex: t,
					correctSampleFound: !0
				};
			} else {
				let n = e.trackData.get(this.internalTrack.id);
				if (n && n.firstKeyFrameTimestamp !== null) {
					let e = n.samples.findIndex((e) => e.isKeyFrame);
					return t(e !== -1), {
						sampleIndex: e,
						correctSampleFound: !0
					};
				}
			}
			return {
				sampleIndex: -1,
				correctSampleFound: !1
			};
		}, -Infinity, Infinity, n);
	}
	async fetchPacketForSampleIndex(e, t) {
		if (e === -1) return null;
		let n = Wr(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), e);
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = I;
		else {
			let t = this.internalTrack.demuxer.reader.requestSlice(n.sampleOffset, n.sampleSize);
			if (A(t) && (t = await t), !t) return null;
			if (r = q(t, n.sampleSize), this.internalTrack.encryptionInfo) {
				let t = null;
				if (this.internalTrack.encryptionAuxInfo) {
					let n = await Xr(this.internalTrack.demuxer.reader, this.internalTrack.encryptionInfo, this.internalTrack.encryptionAuxInfo);
					e < n.length && (t = n[e]);
				}
				t ??= Zr(this.internalTrack.encryptionInfo), t && (r = await Qr(this.internalTrack, t, r, null));
			}
		}
		let i = (n.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, a = n.duration / this.internalTrack.timescale, o = new L(r, n.isKeyFrame ? "key" : "delta", i, a, e, n.sampleSize);
		return this.packetToSampleIndex.set(o, e), o;
	}
	async fetchPacketInFragment(e, n, r) {
		if (n === -1) return null;
		let i = e.trackData.get(this.internalTrack.id).samples[n];
		t(i);
		let a;
		if (r.metadataOnly) a = I;
		else {
			let t = this.internalTrack.demuxer.reader.requestSlice(i.byteOffset, i.byteSize);
			if (A(t) && (t = await t), !t) return null;
			if (a = q(t, i.byteSize), this.internalTrack.encryptionInfo) {
				let t = i.encryption ?? Zr(this.internalTrack.encryptionInfo);
				t && (a = await Qr(this.internalTrack, t, a, e));
			}
		}
		let o = (i.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, s = i.duration / this.internalTrack.timescale, c = new L(a, i.isKeyFrame ? "key" : "delta", o, s, e.moofOffset + n, i.byteSize);
		return this.packetToFragmentLocation.set(c, {
			fragment: e,
			sampleIndex: n
		}), c;
	}
	async performFragmentedLookup(e, n, r, i, a) {
		let o = this.internalTrack.demuxer, s = null, c = null, l = -1;
		if (e) {
			let { sampleIndex: t, correctSampleFound: r } = n(e);
			if (r) return this.fetchPacketInFragment(e, t, a);
			t !== -1 && (c = e, l = t);
		}
		let u = O(this.internalTrack.fragmentLookupTable, r, (e) => e.timestamp), d = u === -1 ? null : this.internalTrack.fragmentLookupTable[u], f = O(this.internalTrack.fragmentPositionCache, r, (e) => e.startTimestamp), p = f === -1 ? null : this.internalTrack.fragmentPositionCache[f], m = Math.max(d?.moofOffset ?? 0, p?.moofOffset ?? 0) || null, h;
		for (e ? m === null || e.moofOffset >= m ? (h = e.moofOffset + e.moofSize, s = e) : h = m : h = m ?? 0;;) {
			if (s) {
				let e = s.trackData.get(this.internalTrack.id);
				if (e && e.startTimestamp > i) break;
			}
			let e = o.reader.requestSliceRange(h, 8, 16);
			if (A(e) && (e = await e), !e) break;
			let t = h, r = Sr(e);
			if (!r) break;
			if (r.name === "moof") {
				s = await o.readFragment(t);
				let { sampleIndex: e, correctSampleFound: r } = n(s);
				if (r) return this.fetchPacketInFragment(s, e, a);
				e !== -1 && (c = s, l = e);
			}
			h = t + r.totalSize;
		}
		if (d && (!c || c.moofOffset < d.moofOffset)) {
			let e = this.internalTrack.fragmentLookupTable[u - 1];
			t(!e || e.timestamp < d.timestamp);
			let r = e?.timestamp ?? -Infinity;
			return this.performFragmentedLookup(null, n, r, i, a);
		}
		return c ? this.fetchPacketInFragment(c, l, a) : null;
	}
}, Br = class extends zr {
	constructor(e) {
		super(e), this.decoderConfigPromise = null, this.internalTrack = e;
	}
	getType() {
		return "video";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getCodedWidth() {
		return this.internalTrack.info.width;
	}
	getCodedHeight() {
		return this.internalTrack.info.height;
	}
	getSquarePixelWidth() {
		return this.internalTrack.info.squarePixelWidth;
	}
	getSquarePixelHeight() {
		return this.internalTrack.info.squarePixelHeight;
	}
	getRotation() {
		return this.internalTrack.rotation;
	}
	async getColorSpace() {
		let e = await this.getDecoderConfig();
		return e ? {
			primaries: e.colorSpace?.primaries,
			transfer: e.colorSpace?.transfer,
			matrix: e.colorSpace?.matrix,
			fullRange: e.colorSpace?.fullRange
		} : this.internalTrack.info.colorSpace;
	}
	async canBeTransparent() {
		return this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
			if (this.internalTrack.info.codec === "avc" && !this.internalTrack.info.codecDescription) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.avcCodecInfo = e && St(e.data);
			} else if (this.internalTrack.info.codec === "hevc" && !this.internalTrack.info.codecDescription) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.hevcCodecInfo = e && jt(e.data);
			} else if (this.internalTrack.info.codec === "vp9" && (!this.internalTrack.info.vp9CodecInfo || !Ut(this.internalTrack.info.vp9CodecInfo))) {
				let e = await this.getFirstPacket({}), t = e && Ht(e.data);
				t && (this.internalTrack.info.vp9CodecInfo = {
					...this.internalTrack.info.vp9CodecInfo ?? t,
					videoFullRangeFlag: t.videoFullRangeFlag,
					colourPrimaries: t.colourPrimaries,
					transferCharacteristics: t.transferCharacteristics,
					matrixCoefficients: t.matrixCoefficients
				});
			} else if (this.internalTrack.info.codec === "av1" && (!this.internalTrack.info.av1CodecInfo || !Kt(this.internalTrack.info.av1CodecInfo))) {
				let e = await this.getFirstPacket({}), t = e && Gt(e.data);
				t && (this.internalTrack.info.av1CodecInfo = t);
			} else if (this.internalTrack.info.codec === "prores" && !this.internalTrack.info.proresCodecInfo) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.proresCodecInfo = e && qt(e.data);
			}
			if (!v(this.internalTrack.info.colorSpace)) {
				let e = qn(this.internalTrack.info);
				this.internalTrack.info.colorSpace.primaries ??= e.primaries, this.internalTrack.info.colorSpace.transfer ??= e.transfer, this.internalTrack.info.colorSpace.matrix ??= e.matrix, this.internalTrack.info.colorSpace.fullRange ??= e.fullRange;
			}
			let e = {
				codec: Kn(this.internalTrack.info),
				codedWidth: this.internalTrack.info.width,
				codedHeight: this.internalTrack.info.height,
				description: this.internalTrack.info.codecDescription ?? void 0,
				colorSpace: this.internalTrack.info.colorSpace
			};
			return (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) && (e.displayAspectWidth = this.internalTrack.info.squarePixelWidth, e.displayAspectHeight = this.internalTrack.info.squarePixelHeight), e;
		})() : null;
	}
}, Vr = class extends zr {
	constructor(e) {
		super(e), this.decoderConfigPromise = null, this.internalTrack = e;
	}
	getType() {
		return "audio";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}
	getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
			if (this.internalTrack.info.codec === "dts" && !this.internalTrack.info.dtsFormat) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.dtsFormat = e && wn(e.data);
			}
			return {
				codec: Jn(this.internalTrack.info),
				numberOfChannels: this.internalTrack.info.numberOfChannels,
				sampleRate: this.internalTrack.info.sampleRate,
				description: this.internalTrack.info.codecDescription ?? void 0
			};
		})() : null;
	}
}, Hr = (e, t) => {
	if (e.presentationTimestamps) {
		let n = O(e.presentationTimestamps, t, (e) => e.presentationTimestamp);
		return n === -1 ? -1 : e.presentationTimestamps[n].sampleIndex;
	}
	{
		let n = O(e.sampleTimingEntries, t, (e) => e.startDecodeTimestamp);
		if (n === -1) return -1;
		let r = e.sampleTimingEntries[n];
		return r.startIndex + Math.min(Math.floor((t - r.startDecodeTimestamp) / r.delta), r.count - 1);
	}
}, Ur = (e, t) => {
	if (!e.keySampleIndices) return Hr(e, t);
	if (e.presentationTimestamps) {
		let n = O(e.presentationTimestamps, t, (e) => e.presentationTimestamp);
		if (n === -1) return -1;
		for (let t = n; t >= 0; t--) {
			let n = e.presentationTimestamps[t].sampleIndex;
			if (D(e.keySampleIndices, n, (e) => e) !== -1) return n;
		}
		return -1;
	}
	{
		let n = Hr(e, t), r = O(e.keySampleIndices, n, (e) => e);
		return e.keySampleIndices[r] ?? -1;
	}
}, Wr = (e, n) => {
	let r = O(e.sampleTimingEntries, n, (e) => e.startIndex), i = e.sampleTimingEntries[r];
	if (!i || i.startIndex + i.count <= n) return null;
	let a = i.startDecodeTimestamp + (n - i.startIndex) * i.delta, o = O(e.sampleCompositionTimeOffsets, n, (e) => e.startIndex), s = e.sampleCompositionTimeOffsets[o];
	s && n - s.startIndex < s.count && (a += s.offset);
	let c = e.sampleSizes[Math.min(n, e.sampleSizes.length - 1)], l = O(e.sampleToChunk, n, (e) => e.startSampleIndex), u = e.sampleToChunk[l];
	t(u);
	let d = u.startChunkIndex + Math.floor((n - u.startSampleIndex) / u.samplesPerChunk), f = e.chunkOffsets[d], p = u.startSampleIndex + (d - u.startChunkIndex) * u.samplesPerChunk, m = 0, h = f;
	if (e.sampleSizes.length === 1) h += c * (n - p), m += c * u.samplesPerChunk;
	else for (let t = p; t < p + u.samplesPerChunk; t++) {
		let r = e.sampleSizes[t];
		t < n && (h += r), m += r;
	}
	let g = i.delta;
	if (e.presentationTimestamps) {
		let r = e.presentationTimestampIndexMap[n];
		t(r !== void 0), r < e.presentationTimestamps.length - 1 && (g = e.presentationTimestamps[r + 1].presentationTimestamp - a);
	}
	return {
		presentationTimestamp: a,
		duration: g,
		sampleOffset: h,
		sampleSize: c,
		chunkOffset: f,
		chunkSize: m,
		isKeyFrame: !e.keySampleIndices || D(e.keySampleIndices, n, (e) => e) !== -1
	};
}, Gr = (e, t) => {
	if (!e.keySampleIndices) return t + 1;
	let n = O(e.keySampleIndices, t, (e) => e);
	return e.keySampleIndices[n + 1] ?? -1;
}, Kr = (e, t) => {
	e.startTimestamp += t, e.endTimestamp += t;
	for (let n of e.samples) n.presentationTimestamp += t;
	for (let n of e.presentationTimestamps) n.presentationTimestamp += t;
}, qr = (e) => {
	let [t, n] = e, r = Math.atan2(n, t);
	return Number.isFinite(r) ? 180 / Math.PI * r : 0;
}, Jr = (e) => e.sampleSizes.length === 0, Yr = (e) => e.currentFragmentState ? e.currentFragmentState.encryptionAuxInfo ??= {
	defaultSampleInfoSize: 0,
	sampleSizes: null,
	sampleCount: 0,
	offset: null,
	resolved: null
} : e.encryptionAuxInfo ??= {
	defaultSampleInfoSize: 0,
	sampleSizes: null,
	sampleCount: 0,
	offset: null,
	resolved: null
}, Xr = async (e, n, r) => {
	if (r.resolved) return r.resolved;
	if (r.offset === null || r.sampleCount === 0) throw Error("Incomplete saiz/saio info; cannot resolve encryption data.");
	let i = 0;
	if (r.defaultSampleInfoSize > 0) i = r.defaultSampleInfoSize * r.sampleCount;
	else {
		t(r.sampleSizes);
		for (let e = 0; e < r.sampleCount; e++) i += r.sampleSizes[e];
	}
	let a = e.requestSlice(r.offset, i);
	if (A(a) && (a = await a), !a) throw Error("Failed to read auxiliary encryption info.");
	let o = n.defaultPerSampleIvSize;
	t(o !== null);
	let s = [];
	for (let e = 0; e < r.sampleCount; e++) {
		let t = r.defaultSampleInfoSize > 0 ? r.defaultSampleInfoSize : r.sampleSizes[e], i = /* @__PURE__ */ new Uint8Array(16);
		o > 0 ? i.set(q(a, o), 0) : i.set(n.defaultConstantIv, 0);
		let c = null;
		if (t > o) {
			let e = Y(a);
			c = [];
			for (let t = 0; t < e; t++) {
				let e = Y(a), t = X(a);
				c.push({
					clearLen: e,
					protectedLen: t
				});
			}
		}
		s.push({
			iv: i,
			subsamples: c
		});
	}
	return r.resolved = s, s;
}, Zr = (e) => e.defaultConstantIv ? {
	iv: e.defaultConstantIv,
	subsamples: null
} : null, Qr = async (e, n, r, i) => {
	t(e.encryptionInfo);
	let a = e.encryptionInfo;
	t(a.defaultKid !== null);
	let o = a.defaultKid, s, c = e.demuxer.decryptionKeyCache.get(o);
	if (c) s = await c;
	else {
		if (!e.demuxer.input._formatOptions.isobmff?.resolveKeyId) throw Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");
		let t = (async () => {
			let t = e.demuxer.psshBoxes;
			if (i) {
				t = [...t, ...i.psshBoxes].filter((e) => e.keyIds === null || e.keyIds.includes(o));
				for (let e = 0; e < t.length - 1; e++) for (let n = e + 1; n < t.length; n++) xr(t[e], t[n]) && (t.splice(n, 1), n--);
			}
			let n = await e.demuxer.input._formatOptions.isobmff.resolveKeyId({
				keyId: o,
				psshBoxes: t
			});
			if (!(typeof n == "string" && n.length === 32 && C.test(n) || n instanceof Uint8Array && n.byteLength === 16)) throw TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");
			return n instanceof Uint8Array ? n : T(n);
		})();
		e.demuxer.decryptionKeyCache.set(o, t), s = await t;
	}
	return a.scheme === "cenc" || a.scheme === "cens" ? $r(s, a, n, r) : ei(s, a, n, r);
}, $r = async (e, n, r, i) => {
	let a = /* @__PURE__ */ new Uint8Array(16);
	a.set(r.iv, 0);
	let o = await crypto.subtle.importKey("raw", e, { name: "AES-CTR" }, !1, ["decrypt"]), s = async (e) => {
		let t = await crypto.subtle.decrypt({
			name: "AES-CTR",
			counter: a,
			length: 64
		}, o, e);
		return new Uint8Array(t);
	};
	if (!r.subsamples) return s(i);
	t(n.defaultCryptByteBlock !== null && n.defaultSkipByteBlock !== null);
	let c = ti(r.subsamples, n.defaultCryptByteBlock, n.defaultSkipByteBlock), l = 0;
	for (let e of c) for (let t of e.perSubsample) l += t.length;
	let u = new Uint8Array(l), d = 0;
	for (let e of c) for (let t of e.perSubsample) u.set(i.subarray(t.offset, t.offset + t.length), d), d += t.length;
	let f = await s(u), p = new Uint8Array(i), m = 0;
	for (let e of c) for (let t of e.perSubsample) p.set(f.subarray(m, m + t.length), t.offset), m += t.length;
	return p;
}, ei = (e, n, r, i) => {
	let a = new Ir();
	a.init({
		key: e,
		iv: r.iv
	});
	let o = n.defaultCryptByteBlock, s = n.defaultSkipByteBlock;
	if (t(o !== null && s !== null), !r.subsamples) {
		let e = new Uint8Array(i), t = Math.floor(i.length / 16);
		for (let n = 0; n < t; n++) {
			let t = n * 16;
			a.in.set(i.subarray(t, t + 16)), a.decrypt(), e.set(a.out, t);
		}
		return e;
	}
	if (o === 0 && s === 0) throw Error("cbcs with subsamples requires pattern encryption.");
	let c = new Uint8Array(i), l = ti(r.subsamples, o, s), u = new DataView(r.iv.buffer, r.iv.byteOffset, 16);
	for (let e of l) {
		a.iv[0] = u.getUint32(0, !1), a.iv[1] = u.getUint32(4, !1), a.iv[2] = u.getUint32(8, !1), a.iv[3] = u.getUint32(12, !1);
		for (let t of e.perSubsample) {
			let e = t.length / 16;
			for (let n = 0; n < e; n++) {
				let e = t.offset + n * 16;
				a.in.set(i.subarray(e, e + 16)), a.decrypt(), c.set(a.out, e);
			}
		}
	}
	return c;
}, ti = (e, t, n) => {
	let r = [], i = t !== 0 || n !== 0, a = 0;
	for (let o of e) {
		a += o.clearLen;
		let e = [];
		if (!i) o.protectedLen > 0 && e.push({
			offset: a,
			length: o.protectedLen
		}), a += o.protectedLen;
		else {
			let r = o.protectedLen, i = a;
			for (; r > 0 && !(r < 16 * t);) {
				let a = 16 * t;
				e.push({
					offset: i,
					length: a
				}), i += a, r -= a;
				let o = Math.min(16 * n, r);
				i += o, r -= o;
			}
			a += o.protectedLen;
		}
		r.push({ perSubsample: e });
	}
	return r;
}, ni = class {
	constructor(e) {
		this.value = e;
	}
}, ri = class {
	constructor(e) {
		this.value = e;
	}
}, ii = class {
	constructor(e) {
		this.value = e;
	}
}, ai = class {
	constructor(e) {
		this.value = e;
	}
}, z;
(function(e) {
	e[e.EBML = 440786851] = "EBML", e[e.EBMLVersion = 17030] = "EBMLVersion", e[e.EBMLReadVersion = 17143] = "EBMLReadVersion", e[e.EBMLMaxIDLength = 17138] = "EBMLMaxIDLength", e[e.EBMLMaxSizeLength = 17139] = "EBMLMaxSizeLength", e[e.DocType = 17026] = "DocType", e[e.DocTypeVersion = 17031] = "DocTypeVersion", e[e.DocTypeReadVersion = 17029] = "DocTypeReadVersion", e[e.Void = 236] = "Void", e[e.Segment = 408125543] = "Segment", e[e.SeekHead = 290298740] = "SeekHead", e[e.Seek = 19899] = "Seek", e[e.SeekID = 21419] = "SeekID", e[e.SeekPosition = 21420] = "SeekPosition", e[e.Duration = 17545] = "Duration", e[e.Info = 357149030] = "Info", e[e.TimestampScale = 2807729] = "TimestampScale", e[e.MuxingApp = 19840] = "MuxingApp", e[e.WritingApp = 22337] = "WritingApp", e[e.Tracks = 374648427] = "Tracks", e[e.TrackEntry = 174] = "TrackEntry", e[e.TrackNumber = 215] = "TrackNumber", e[e.TrackUID = 29637] = "TrackUID", e[e.TrackType = 131] = "TrackType", e[e.FlagEnabled = 185] = "FlagEnabled", e[e.FlagDefault = 136] = "FlagDefault", e[e.FlagForced = 21930] = "FlagForced", e[e.FlagOriginal = 21934] = "FlagOriginal", e[e.FlagHearingImpaired = 21931] = "FlagHearingImpaired", e[e.FlagVisualImpaired = 21932] = "FlagVisualImpaired", e[e.FlagCommentary = 21935] = "FlagCommentary", e[e.FlagLacing = 156] = "FlagLacing", e[e.Name = 21358] = "Name", e[e.Language = 2274716] = "Language", e[e.LanguageBCP47 = 2274717] = "LanguageBCP47", e[e.CodecID = 134] = "CodecID", e[e.CodecPrivate = 25506] = "CodecPrivate", e[e.CodecDelay = 22186] = "CodecDelay", e[e.SeekPreRoll = 22203] = "SeekPreRoll", e[e.DefaultDuration = 2352003] = "DefaultDuration", e[e.Video = 224] = "Video", e[e.PixelWidth = 176] = "PixelWidth", e[e.PixelHeight = 186] = "PixelHeight", e[e.DisplayWidth = 21680] = "DisplayWidth", e[e.DisplayHeight = 21690] = "DisplayHeight", e[e.DisplayUnit = 21682] = "DisplayUnit", e[e.AlphaMode = 21440] = "AlphaMode", e[e.Audio = 225] = "Audio", e[e.SamplingFrequency = 181] = "SamplingFrequency", e[e.Channels = 159] = "Channels", e[e.BitDepth = 25188] = "BitDepth", e[e.SimpleBlock = 163] = "SimpleBlock", e[e.BlockGroup = 160] = "BlockGroup", e[e.Block = 161] = "Block", e[e.BlockAdditions = 30113] = "BlockAdditions", e[e.BlockMore = 166] = "BlockMore", e[e.BlockAdditional = 165] = "BlockAdditional", e[e.BlockAddID = 238] = "BlockAddID", e[e.BlockDuration = 155] = "BlockDuration", e[e.ReferenceBlock = 251] = "ReferenceBlock", e[e.Cluster = 524531317] = "Cluster", e[e.Timestamp = 231] = "Timestamp", e[e.Cues = 475249515] = "Cues", e[e.CuePoint = 187] = "CuePoint", e[e.CueTime = 179] = "CueTime", e[e.CueTrackPositions = 183] = "CueTrackPositions", e[e.CueTrack = 247] = "CueTrack", e[e.CueClusterPosition = 241] = "CueClusterPosition", e[e.Colour = 21936] = "Colour", e[e.MatrixCoefficients = 21937] = "MatrixCoefficients", e[e.TransferCharacteristics = 21946] = "TransferCharacteristics", e[e.Primaries = 21947] = "Primaries", e[e.Range = 21945] = "Range", e[e.Projection = 30320] = "Projection", e[e.ProjectionType = 30321] = "ProjectionType", e[e.ProjectionPoseRoll = 30325] = "ProjectionPoseRoll", e[e.Attachments = 423732329] = "Attachments", e[e.AttachedFile = 24999] = "AttachedFile", e[e.FileDescription = 18046] = "FileDescription", e[e.FileName = 18030] = "FileName", e[e.FileMediaType = 18016] = "FileMediaType", e[e.FileData = 18012] = "FileData", e[e.FileUID = 18094] = "FileUID", e[e.Chapters = 272869232] = "Chapters", e[e.Tags = 307544935] = "Tags", e[e.Tag = 29555] = "Tag", e[e.Targets = 25536] = "Targets", e[e.TargetTypeValue = 26826] = "TargetTypeValue", e[e.TargetType = 25546] = "TargetType", e[e.TagTrackUID = 25541] = "TagTrackUID", e[e.TagEditionUID = 25545] = "TagEditionUID", e[e.TagChapterUID = 25540] = "TagChapterUID", e[e.TagAttachmentUID = 25542] = "TagAttachmentUID", e[e.SimpleTag = 26568] = "SimpleTag", e[e.TagName = 17827] = "TagName", e[e.TagLanguage = 17530] = "TagLanguage", e[e.TagString = 17543] = "TagString", e[e.TagBinary = 17541] = "TagBinary", e[e.ContentEncodings = 28032] = "ContentEncodings", e[e.ContentEncoding = 25152] = "ContentEncoding", e[e.ContentEncodingOrder = 20529] = "ContentEncodingOrder", e[e.ContentEncodingScope = 20530] = "ContentEncodingScope", e[e.ContentCompression = 20532] = "ContentCompression", e[e.ContentCompAlgo = 16980] = "ContentCompAlgo", e[e.ContentCompSettings = 16981] = "ContentCompSettings", e[e.ContentEncryption = 20533] = "ContentEncryption";
})(z ||= {});
var oi = [z.EBML, z.Segment], si = [
	z.SeekHead,
	z.Info,
	z.Cluster,
	z.Tracks,
	z.Cues,
	z.Attachments,
	z.Chapters,
	z.Tags
], ci = [...oi, ...si], li = (e) => e < 256 ? 1 : e < 65536 ? 2 : e < 1 << 24 ? 3 : e < 2 ** 32 ? 4 : e < 2 ** 40 ? 5 : 6, ui = (e) => e < 1n << 8n ? 1 : e < 1n << 16n ? 2 : e < 1n << 24n ? 3 : e < 1n << 32n ? 4 : e < 1n << 40n ? 5 : e < 1n << 48n ? 6 : e < 1n << 56n ? 7 : 8, di = (e) => e >= -64 && e < 64 ? 1 : e >= -8192 && e < 8192 ? 2 : e >= -1048576 && e < 1 << 20 ? 3 : e >= -134217728 && e < 1 << 27 ? 4 : e >= -(2 ** 34) && e < 2 ** 34 ? 5 : 6, fi = (e) => {
	if (e < 127) return 1;
	if (e < 16383) return 2;
	if (e < (1 << 21) - 1) return 3;
	if (e < (1 << 28) - 1) return 4;
	if (e < 2 ** 35 - 1) return 5;
	if (e < 2 ** 42 - 1) return 6;
	throw Error("EBML varint size not supported " + e);
}, pi = class {
	constructor(e) {
		this.writer = e, this.helper = /* @__PURE__ */ new Uint8Array(8), this.helperView = new DataView(this.helper.buffer), this.offsets = /* @__PURE__ */ new WeakMap(), this.dataOffsets = /* @__PURE__ */ new WeakMap();
	}
	writeByte(e) {
		this.helperView.setUint8(0, e), this.writer.write(this.helper.subarray(0, 1));
	}
	writeFloat32(e) {
		this.helperView.setFloat32(0, e, !1), this.writer.write(this.helper.subarray(0, 4));
	}
	writeFloat64(e) {
		this.helperView.setFloat64(0, e, !1), this.writer.write(this.helper);
	}
	writeUnsignedInt(e, t = li(e)) {
		let n = 0;
		switch (t) {
			case 6: this.helperView.setUint8(n++, e / 2 ** 40 | 0);
			case 5: this.helperView.setUint8(n++, e / 2 ** 32 | 0);
			case 4: this.helperView.setUint8(n++, e >> 24);
			case 3: this.helperView.setUint8(n++, e >> 16);
			case 2: this.helperView.setUint8(n++, e >> 8);
			case 1:
				this.helperView.setUint8(n++, e);
				break;
			default: throw Error("Bad unsigned int size " + t);
		}
		this.writer.write(this.helper.subarray(0, n));
	}
	writeUnsignedBigInt(e, t = ui(e)) {
		let n = 0;
		for (let r = t - 1; r >= 0; r--) this.helperView.setUint8(n++, Number(e >> BigInt(r * 8) & 255n));
		this.writer.write(this.helper.subarray(0, n));
	}
	writeSignedInt(e, t = di(e)) {
		e < 0 && (e += 2 ** (t * 8)), this.writeUnsignedInt(e, t);
	}
	writeVarInt(e, t = fi(e)) {
		let n = 0;
		switch (t) {
			case 1:
				this.helperView.setUint8(n++, 128 | e);
				break;
			case 2:
				this.helperView.setUint8(n++, 64 | e >> 8), this.helperView.setUint8(n++, e);
				break;
			case 3:
				this.helperView.setUint8(n++, 32 | e >> 16), this.helperView.setUint8(n++, e >> 8), this.helperView.setUint8(n++, e);
				break;
			case 4:
				this.helperView.setUint8(n++, 16 | e >> 24), this.helperView.setUint8(n++, e >> 16), this.helperView.setUint8(n++, e >> 8), this.helperView.setUint8(n++, e);
				break;
			case 5:
				this.helperView.setUint8(n++, 8 | e / 2 ** 32 & 7), this.helperView.setUint8(n++, e >> 24), this.helperView.setUint8(n++, e >> 16), this.helperView.setUint8(n++, e >> 8), this.helperView.setUint8(n++, e);
				break;
			case 6:
				this.helperView.setUint8(n++, 4 | e / 2 ** 40 & 3), this.helperView.setUint8(n++, e / 2 ** 32 | 0), this.helperView.setUint8(n++, e >> 24), this.helperView.setUint8(n++, e >> 16), this.helperView.setUint8(n++, e >> 8), this.helperView.setUint8(n++, e);
				break;
			default: throw Error("Bad EBML varint size " + t);
		}
		this.writer.write(this.helper.subarray(0, n));
	}
	writeAsciiString(e) {
		this.writer.write(new Uint8Array(e.split("").map((e) => e.charCodeAt(0))));
	}
	writeEBML(e) {
		if (e !== null) {
			if (e instanceof Uint8Array) this.writer.write(e);
			else if (Array.isArray(e)) for (let t of e) this.writeEBML(t);
			else if (this.offsets.set(e, this.writer.getPos()), this.writeUnsignedInt(e.id), Array.isArray(e.data)) {
				let t = this.writer.getPos(), n = e.size === -1 ? 1 : e.size ?? 4;
				e.size === -1 ? this.writeByte(255) : this.writer.seek(this.writer.getPos() + n);
				let r = this.writer.getPos();
				if (this.dataOffsets.set(e, r), this.writeEBML(e.data), e.size !== -1) {
					let e = this.writer.getPos() - r, i = this.writer.getPos();
					this.writer.seek(t), this.writeVarInt(e, n), this.writer.seek(i);
				}
			} else if (typeof e.data == "number") {
				let t = e.size ?? li(e.data);
				this.writeVarInt(t), this.writeUnsignedInt(e.data, t);
			} else if (typeof e.data == "bigint") {
				let t = e.size ?? ui(e.data);
				this.writeVarInt(t), this.writeUnsignedBigInt(e.data, t);
			} else if (typeof e.data == "string") this.writeVarInt(e.data.length), this.writeAsciiString(e.data);
			else if (e.data instanceof Uint8Array) this.writeVarInt(e.data.byteLength, e.size), this.writer.write(e.data);
			else if (e.data instanceof ni) this.writeVarInt(4), this.writeFloat32(e.data.value);
			else if (e.data instanceof ri) this.writeVarInt(8), this.writeFloat64(e.data.value);
			else if (e.data instanceof ii) {
				let t = e.size ?? di(e.data.value);
				this.writeVarInt(t), this.writeSignedInt(e.data.value, t);
			} else if (e.data instanceof ai) {
				let t = u.encode(e.data.value);
				this.writeVarInt(t.length), this.writer.write(t);
			} else oe(e.data);
		}
	}
}, mi = (e) => {
	if (e.remainingLength < 1) return null;
	let t = J(e);
	if (e.skip(-1), t === 0) return null;
	let n = 1, r = 128;
	for (; (t & r) === 0;) n++, r >>= 1;
	return e.remainingLength < n ? null : n;
}, hi = (e) => {
	if (e.remainingLength < 1) return null;
	let t = J(e);
	if (t === 0) return null;
	let n = 1, r = 128;
	for (; (t & r) === 0;) n++, r >>= 1;
	if (e.remainingLength < n - 1) return null;
	let i = t & r - 1;
	for (let t = 1; t < n; t++) i *= 256, i += J(e);
	return i;
}, B = (e, t) => {
	if (t < 1 || t > 8) throw Error("Bad unsigned int size " + t);
	let n = 0;
	for (let r = 0; r < t; r++) n *= 256, n += J(e);
	return n;
}, gi = (e, t) => {
	if (t < 1) throw Error("Bad unsigned int size " + t);
	let n = 0n;
	for (let r = 0; r < t; r++) n <<= 8n, n += BigInt(J(e));
	return n;
}, _i = (e) => {
	let t = mi(e);
	return t === null || e.remainingLength < t ? null : B(e, t);
}, vi = (e) => {
	if (e.remainingLength < 1) return null;
	if (J(e) === 255) return;
	e.skip(-1);
	let t = hi(e);
	if (t === null) return null;
	if (t !== 72057594037927940) return t;
}, yi = (e) => {
	t(e.remainingLength >= 2);
	let n = _i(e);
	if (n === null) return null;
	let r = vi(e);
	return r === null ? null : {
		id: n,
		size: r
	};
}, bi = (e, t) => {
	let n = q(e, t), r = 0;
	for (; r < t && n[r] !== 0;) r += 1;
	return String.fromCharCode(...n.subarray(0, r));
}, xi = (e, t) => {
	let n = q(e, t), r = 0;
	for (; r < t && n[r] !== 0;) r += 1;
	return l.decode(n.subarray(0, r));
}, Si = (e, t) => {
	if (t === 0) return 0;
	if (t !== 4 && t !== 8) throw Error("Bad float size " + t);
	return t === 4 ? ac(e) : oc(e);
}, Ci = async (e, t, n, r) => {
	let i = new Set(n), a = t;
	for (; r === null || a < r;) {
		let t = e.requestSliceRange(a, 2, 16);
		if (A(t) && (t = await t), !t) break;
		let n = yi(t);
		if (!n) break;
		if (i.has(n.id)) return {
			pos: a,
			found: !0
		};
		Ti(n.size), a = t.filePos + n.size;
	}
	return {
		pos: r !== null && r > a ? r : a,
		found: !1
	};
}, wi = async (e, t, n, r) => {
	let i = 2 ** 16, a = new Set(n), o = t;
	for (; o < r;) {
		let t = e.requestSliceRange(o, 0, Math.min(i, r - o));
		if (A(t) && (t = await t), !t || t.length < 8) break;
		for (let e = 0; e < t.length - 8; e++) {
			t.filePos = o;
			let e = _i(t);
			if (e !== null && a.has(e)) return o;
			o++;
		}
	}
	return null;
}, V = {
	avc: "V_MPEG4/ISO/AVC",
	hevc: "V_MPEGH/ISO/HEVC",
	vp8: "V_VP8",
	vp9: "V_VP9",
	av1: "V_AV1",
	prores: "V_PRORES",
	aac: "A_AAC",
	mp3: "A_MPEG/L3",
	opus: "A_OPUS",
	vorbis: "A_VORBIS",
	flac: "A_FLAC",
	ac3: "A_AC3",
	eac3: "A_EAC3",
	dts: "A_DTS",
	"pcm-u8": "A_PCM/INT/LIT",
	"pcm-s16": "A_PCM/INT/LIT",
	"pcm-s16be": "A_PCM/INT/BIG",
	"pcm-s24": "A_PCM/INT/LIT",
	"pcm-s24be": "A_PCM/INT/BIG",
	"pcm-s32": "A_PCM/INT/LIT",
	"pcm-s32be": "A_PCM/INT/BIG",
	"pcm-f32": "A_PCM/FLOAT/IEEE",
	"pcm-f64": "A_PCM/FLOAT/IEEE",
	webvtt: "S_TEXT/WEBVTT"
};
function Ti(e) {
	if (e === void 0) throw Error("Undefined element size is used in a place where it is not supported.");
}
//#endregion
//#region node_modules/mediabunny/dist/modules/src/matroska/matroska-misc.js
var Ei = (e) => {
	let t = (e.hasVideo ? "video/" : e.hasAudio ? "audio/" : "application/") + (e.isWebM ? "webm" : "x-matroska");
	if (e.codecStrings.length > 0) {
		let n = [...new Set(e.codecStrings.filter(Boolean))];
		t += `; codecs="${n.join(", ")}"`;
	}
	return t;
}, Di;
(function(e) {
	e[e.None = 0] = "None", e[e.Xiph = 1] = "Xiph", e[e.FixedSize = 2] = "FixedSize", e[e.Ebml = 3] = "Ebml";
})(Di ||= {});
var Oi;
(function(e) {
	e[e.Block = 1] = "Block", e[e.Private = 2] = "Private", e[e.Next = 4] = "Next";
})(Oi ||= {});
var ki;
(function(e) {
	e[e.Zlib = 0] = "Zlib", e[e.Bzlib = 1] = "Bzlib", e[e.lzo1x = 2] = "lzo1x", e[e.HeaderStripping = 3] = "HeaderStripping";
})(ki ||= {});
var Ai = [
	{
		id: z.SeekHead,
		flag: "seekHeadSeen"
	},
	{
		id: z.Info,
		flag: "infoSeen"
	},
	{
		id: z.Tracks,
		flag: "tracksSeen"
	},
	{
		id: z.Cues,
		flag: "cuesSeen"
	}
], ji = 10 * 2 ** 20, Mi = class extends vr {
	constructor(e) {
		super(e), this.readMetadataPromise = null, this.segments = [], this.currentSegment = null, this.currentTrack = null, this.currentCluster = null, this.currentBlock = null, this.currentBlockAdditional = null, this.currentCueTime = null, this.currentDecodingInstruction = null, this.currentTagTargetIsMovie = !0, this.currentSimpleTagName = null, this.currentAttachedFile = null, this.isWebM = !1, this.reader = e._reader;
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.segments.flatMap((e) => e.tracks.map((e) => e.trackBacking));
	}
	async getMimeType() {
		await this.readMetadata();
		let e = await this.getTrackBackings(), t = await Promise.all(e.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)));
		return Ei({
			isWebM: this.isWebM,
			hasVideo: this.segments.some((e) => e.tracks.some((e) => e.info?.type === "video")),
			hasAudio: this.segments.some((e) => e.tracks.some((e) => e.info?.type === "audio")),
			codecStrings: t.filter(Boolean)
		});
	}
	async getMetadataTags() {
		await this.readMetadata();
		for (let e of this.segments) e.metadataTagsCollected ||= (this.reader.fileSize !== null && await this.loadSegmentMetadata(e), !0);
		let e = {};
		for (let t of this.segments) e = {
			...e,
			...t.metadataTags
		};
		return e;
	}
	readMetadata() {
		return this.readMetadataPromise ??= (async () => {
			let e = 0;
			for (;;) {
				let t = this.reader.requestSliceRange(e, 2, 16);
				if (A(t) && (t = await t), !t) break;
				let n = yi(t);
				if (!n) break;
				let i = n.id, a = n.size, o = t.filePos;
				if (i === z.EBML) {
					Ti(a);
					let e = this.reader.requestSlice(o, a);
					if (A(e) && (e = await e), !e) break;
					this.readContiguousElements(e);
				} else if (i === z.Segment) {
					if (await this.readSegment(o, a), a === void 0 || this.reader.fileSize === null) break;
				} else if (i === z.Cluster) {
					if (this.reader.fileSize === null) break;
					a === void 0 && (a = (await Ci(this.reader, o, ci, this.reader.fileSize)).pos - o);
					let e = r(this.segments);
					e && (e.elementEndPos = o + a);
				}
				Ti(a), e = o + a;
			}
		})();
	}
	async readSegment(e, t) {
		this.currentSegment = {
			seekHeadSeen: !1,
			infoSeen: !1,
			tracksSeen: !1,
			cuesSeen: !1,
			tagsSeen: !1,
			attachmentsSeen: !1,
			timestampScale: -1,
			timestampFactor: -1,
			duration: -1,
			seekEntries: [],
			tracks: [],
			cuePoints: [],
			dataStartPos: e,
			elementEndPos: t === void 0 ? null : e + t,
			clusterSeekStartPos: e,
			lastReadCluster: null,
			metadataTags: {},
			metadataTagsCollected: !1
		}, this.segments.push(this.currentSegment);
		let n = e;
		for (; this.currentSegment.elementEndPos === null || n < this.currentSegment.elementEndPos;) {
			let e = this.reader.requestSliceRange(n, 2, 16);
			if (A(e) && (e = await e), !e) break;
			let t = n, r = yi(e);
			if (!r || !si.includes(r.id) && r.id !== z.Void) {
				let e = await wi(this.reader, t, si, Math.min(this.currentSegment.elementEndPos ?? Infinity, t + ji));
				if (e) {
					n = e;
					continue;
				}
				break;
			}
			let { id: i, size: a } = r, o = e.filePos, s = Ai.findIndex((e) => e.id === i);
			if (s !== -1) {
				let e = Ai[s].flag;
				this.currentSegment[e] = !0, Ti(a);
				let t = this.reader.requestSlice(o, a);
				A(t) && (t = await t), t && this.readContiguousElements(t);
			} else if (i === z.Tags || i === z.Attachments) {
				i === z.Tags ? this.currentSegment.tagsSeen = !0 : this.currentSegment.attachmentsSeen = !0, Ti(a);
				let e = this.reader.requestSlice(o, a);
				A(e) && (e = await e), e && this.readContiguousElements(e);
			} else if (i === z.Cluster) {
				this.currentSegment.clusterSeekStartPos = t;
				break;
			}
			if (a === void 0) break;
			n = o + a;
		}
		if (this.currentSegment.seekEntries.sort((e, t) => e.segmentPosition - t.segmentPosition), this.reader.fileSize !== null) for (let t of this.currentSegment.seekEntries) {
			let n = Ai.find((e) => e.id === t.id);
			if (!n || this.currentSegment[n.flag]) continue;
			let r = this.reader.requestSliceRange(e + t.segmentPosition, 2, 16);
			if (A(r) && (r = await r), !r) continue;
			let i = yi(r);
			if (!i) continue;
			let { id: a, size: o } = i;
			if (a !== n.id) continue;
			Ti(o), this.currentSegment[n.flag] = !0;
			let s = this.reader.requestSlice(r.filePos, o);
			A(s) && (s = await s), s && this.readContiguousElements(s);
		}
		this.currentSegment.timestampScale === -1 && (this.currentSegment.timestampScale = 1e6, this.currentSegment.timestampFactor = 1e3);
		for (let e of this.currentSegment.tracks) e.defaultDurationNs !== null && (e.defaultDuration = this.currentSegment.timestampFactor * e.defaultDurationNs / 1e9);
		let r = new Map(this.currentSegment.tracks.map((e) => [e.id, e]));
		for (let e of this.currentSegment.cuePoints) {
			let t = r.get(e.trackId);
			t && t.cuePoints.push(e);
		}
		for (let e of this.currentSegment.tracks) {
			e.cuePoints.sort((e, t) => e.time - t.time);
			for (let t = 0; t < e.cuePoints.length - 1; t++) {
				let n = e.cuePoints[t], r = e.cuePoints[t + 1];
				n.time === r.time && (e.cuePoints.splice(t + 1, 1), t--);
			}
		}
		let i = null, a = -Infinity;
		for (let e of this.currentSegment.tracks) e.cuePoints.length > a && (a = e.cuePoints.length, i = e);
		for (let e of this.currentSegment.tracks) e.cuePoints.length === 0 && (e.cuePoints = i.cuePoints);
		this.currentSegment = null;
	}
	async readCluster(e, n) {
		if (n.lastReadCluster?.elementStartPos === e) return n.lastReadCluster;
		let i = this.reader.requestSliceRange(e, 2, 16);
		A(i) && (i = await i), t(i);
		let a = e, o = yi(i);
		t(o);
		let s = o.id;
		t(s === z.Cluster);
		let c = o.size, l = i.filePos;
		c === void 0 && (c = (await Ci(this.reader, l, ci, n.elementEndPos)).pos - l);
		let u = this.reader.requestSlice(l, c);
		A(u) && (u = await u);
		let d = {
			segment: n,
			elementStartPos: a,
			elementEndPos: l + c,
			dataStartPos: l,
			timestamp: -1,
			trackData: /* @__PURE__ */ new Map()
		};
		this.currentCluster = d, u && (d.elementEndPos = this.readContiguousElements(u, ci));
		for (let [, e] of d.trackData) {
			let n = e.track;
			t(e.blocks.length > 0);
			let i = !1;
			for (let t = 0; t < e.blocks.length; t++) {
				let n = e.blocks[t];
				n.timestamp += d.timestamp, i ||= n.lacing !== Di.None;
			}
			e.presentationTimestamps = e.blocks.map((e, t) => ({
				timestamp: e.timestamp,
				blockIndex: t
			})).sort((e, t) => e.timestamp - t.timestamp);
			for (let t = 0; t < e.presentationTimestamps.length; t++) {
				let r = e.presentationTimestamps[t], i = e.blocks[r.blockIndex];
				e.firstKeyFrameTimestamp === null && i.isKeyFrame && (e.firstKeyFrameTimestamp = i.timestamp), t < e.presentationTimestamps.length - 1 ? i.duration = e.presentationTimestamps[t + 1].timestamp - i.timestamp : i.duration === 0 && n.defaultDuration != null && i.lacing === Di.None && (i.duration = n.defaultDuration);
			}
			i && (this.expandLacedBlocks(e.blocks, n), e.presentationTimestamps = e.blocks.map((e, t) => ({
				timestamp: e.timestamp,
				blockIndex: t
			})).sort((e, t) => e.timestamp - t.timestamp));
			let o = e.blocks[e.presentationTimestamps[0].blockIndex], s = e.blocks[r(e.presentationTimestamps).blockIndex];
			e.startTimestamp = o.timestamp, e.endTimestamp = s.timestamp + s.duration;
			let c = O(n.clusterPositionCache, e.startTimestamp, (e) => e.startTimestamp);
			(c === -1 || n.clusterPositionCache[c].elementStartPos !== a) && n.clusterPositionCache.splice(c + 1, 0, {
				elementStartPos: d.elementStartPos,
				startTimestamp: e.startTimestamp
			});
		}
		return n.lastReadCluster = d, d;
	}
	getTrackDataInCluster(e, t) {
		let n = e.trackData.get(t);
		if (!n) {
			let r = e.segment.tracks.find((e) => e.id === t);
			if (!r) return null;
			n = {
				track: r,
				startTimestamp: 0,
				endTimestamp: 0,
				firstKeyFrameTimestamp: null,
				blocks: [],
				presentationTimestamps: []
			}, e.trackData.set(t, n);
		}
		return n;
	}
	expandLacedBlocks(e, n) {
		for (let r = 0; r < e.length; r++) {
			let i = e[r];
			if (i.lacing === Di.None) continue;
			i.decoded ||= (i.data = this.decodeBlockData(n, i.data), !0);
			let a = Js.tempFromBytes(i.data), o = [], s = J(a) + 1;
			switch (i.lacing) {
				case Di.Xiph:
					{
						let e = 0;
						for (let t = 0; t < s - 1; t++) {
							let t = 0;
							for (; a.bufferPos < a.length;) {
								let n = J(a);
								if (t += n, n < 255) {
									o.push(t), e += t;
									break;
								}
							}
						}
						o.push(a.length - (a.bufferPos + e));
					}
					break;
				case Di.FixedSize:
					{
						let e = a.length - 1, t = Math.floor(e / s);
						for (let e = 0; e < s; e++) o.push(t);
					}
					break;
				case Di.Ebml:
					{
						let e = hi(a);
						t(e !== null);
						let n = e;
						o.push(n);
						let r = n;
						for (let e = 1; e < s - 1; e++) {
							let e = a.bufferPos, i = hi(a);
							t(i !== null);
							let s = i - ((1 << (a.bufferPos - e) * 7 - 1) - 1);
							n += s, o.push(n), r += n;
						}
						o.push(a.length - (a.bufferPos + r));
					}
					break;
				default: t(!1);
			}
			t(o.length === s), e.splice(r, 1);
			let c = i.duration || s * (n.defaultDuration ?? 0);
			for (let t = 0; t < s; t++) {
				let n = o[t], l = q(a, n), u = i.timestamp + c * t / s, d = c / s;
				e.splice(r + t, 0, {
					timestamp: u,
					duration: d,
					isKeyFrame: i.isKeyFrame,
					data: l,
					lacing: Di.None,
					decoded: !0,
					postProcessed: !1,
					mainAdditional: i.mainAdditional
				});
			}
			r += s, r--;
		}
	}
	async loadSegmentMetadata(e) {
		for (let n of e.seekEntries) {
			if (!(n.id === z.Tags && !e.tagsSeen) && !(n.id === z.Attachments && !e.attachmentsSeen)) continue;
			let r = this.reader.requestSliceRange(e.dataStartPos + n.segmentPosition, 2, 16);
			if (A(r) && (r = await r), !r) continue;
			let i = yi(r);
			if (!i || i.id !== n.id) continue;
			let { size: a } = i;
			Ti(a), t(!this.currentSegment), this.currentSegment = e;
			let o = this.reader.requestSlice(r.filePos, a);
			A(o) && (o = await o), o && this.readContiguousElements(o), this.currentSegment = null, n.id === z.Tags ? e.tagsSeen = !0 : n.id === z.Attachments && (e.attachmentsSeen = !0);
		}
	}
	readContiguousElements(e, t) {
		for (; e.remainingLength >= 2;) {
			let n = e.filePos;
			if (!this.traverseElement(e, t)) return n;
		}
		return e.filePos;
	}
	traverseElement(e, r) {
		let i = yi(e);
		if (!i || r && r.includes(i.id)) return !1;
		let { id: a, size: o } = i, s = e.filePos;
		switch (Ti(o), a) {
			case z.DocType:
				this.isWebM = bi(e, o) === "webm";
				break;
			case z.Seek:
				{
					if (!this.currentSegment) break;
					let t = {
						id: -1,
						segmentPosition: -1
					};
					this.currentSegment.seekEntries.push(t), this.readContiguousElements(e.slice(s, o)), (t.id === -1 || t.segmentPosition === -1) && this.currentSegment.seekEntries.pop();
				}
				break;
			case z.SeekID:
				{
					let t = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
					if (!t) break;
					t.id = B(e, o);
				}
				break;
			case z.SeekPosition:
				{
					let t = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
					if (!t) break;
					t.segmentPosition = B(e, o);
				}
				break;
			case z.TimestampScale:
				if (!this.currentSegment) break;
				this.currentSegment.timestampScale = B(e, o), this.currentSegment.timestampFactor = 1e9 / this.currentSegment.timestampScale;
				break;
			case z.Duration:
				if (!this.currentSegment) break;
				this.currentSegment.duration = Si(e, o);
				break;
			case z.TrackEntry:
				if (!this.currentSegment || (this.currentTrack = {
					id: -1,
					segment: this.currentSegment,
					demuxer: this,
					clusterPositionCache: [],
					cuePoints: [],
					disposition: {
						...et,
						primary: !1
					},
					trackBacking: null,
					codecId: null,
					codecPrivate: null,
					defaultDuration: null,
					defaultDurationNs: null,
					name: null,
					languageCode: "eng",
					hasLanguageBcp47: !1,
					decodingInstructions: [],
					info: null
				}, this.readContiguousElements(e.slice(s, o)), !this.currentTrack)) break;
				if (this.currentTrack.decodingInstructions.some((e) => e.data?.type !== "decompress" || e.scope !== Oi.Block || e.data.algorithm !== ki.HeaderStripping) && (j._warn(`Track #${this.currentTrack.id} has an unsupported content encoding; dropping.`), this.currentTrack = null), this.currentTrack && this.currentTrack.id !== -1 && this.currentTrack.codecId && this.currentTrack.info) {
					let e = this.currentTrack.codecId.indexOf("/"), t = e === -1 ? this.currentTrack.codecId : this.currentTrack.codecId.slice(0, e);
					if (this.currentTrack.info.type === "video" && this.currentTrack.info.width !== -1 && this.currentTrack.info.height !== -1) {
						if (this.currentTrack.info.squarePixelWidth = this.currentTrack.info.width, this.currentTrack.info.squarePixelHeight = this.currentTrack.info.height, this.currentTrack.info.displayWidth !== null && this.currentTrack.info.displayHeight !== null) {
							let e = this.currentTrack.info.displayWidth * this.currentTrack.info.height, t = this.currentTrack.info.displayHeight * this.currentTrack.info.width;
							e > 0 && t > 0 && (e > t ? this.currentTrack.info.squarePixelWidth = Math.round(this.currentTrack.info.width * e / t) : this.currentTrack.info.squarePixelHeight = Math.round(this.currentTrack.info.height * t / e));
						}
						if (this.currentTrack.codecId === V.avc) this.currentTrack.info.codec = "avc", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
						else if (this.currentTrack.codecId === V.hevc) this.currentTrack.info.codec = "hevc", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
						else if (t === V.vp8) this.currentTrack.info.codec = "vp8";
						else if (t === V.vp9) this.currentTrack.info.codec = "vp9";
						else if (t === V.av1) this.currentTrack.info.codec = "av1";
						else if (t === V.prores) {
							let e = this.currentTrack.codecPrivate ? l.decode(this.currentTrack.codecPrivate) : "";
							Bn.includes(e) && (this.currentTrack.info.codec = "prores", this.currentTrack.info.proresFormat = e);
						}
						let e = this.currentTrack;
						this.currentTrack.trackBacking = new Pi(e), this.currentSegment.tracks.push(this.currentTrack);
					} else if (this.currentTrack.info.type === "audio") {
						t === V.aac ? (this.currentTrack.info.codec = "aac", this.currentTrack.info.aacCodecInfo = {
							isMpeg2: this.currentTrack.codecId.includes("MPEG2"),
							objectType: null
						}, this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : this.currentTrack.codecId === V.mp3 ? this.currentTrack.info.codec = "mp3" : t === V.opus ? (this.currentTrack.info.codec = "opus", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate, this.currentTrack.info.sampleRate = Yn) : t === V.vorbis ? (this.currentTrack.info.codec = "vorbis", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === V.flac ? (this.currentTrack.info.codec = "flac", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === V.ac3 ? (this.currentTrack.info.codec = "ac3", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === V.eac3 ? (this.currentTrack.info.codec = "eac3", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === V.dts ? (this.currentTrack.info.codec = "dts", this.currentTrack.codecId === "A_DTS/EXPRESS" ? this.currentTrack.info.dtsFormat = "dtse" : this.currentTrack.codecId === "A_DTS/LOSSLESS" && (this.currentTrack.info.dtsFormat = "dtsl")) : this.currentTrack.codecId === "A_PCM/INT/LIT" ? this.currentTrack.info.bitDepth === 8 ? this.currentTrack.info.codec = "pcm-u8" : this.currentTrack.info.bitDepth === 16 ? this.currentTrack.info.codec = "pcm-s16" : this.currentTrack.info.bitDepth === 24 ? this.currentTrack.info.codec = "pcm-s24" : this.currentTrack.info.bitDepth === 32 && (this.currentTrack.info.codec = "pcm-s32") : this.currentTrack.codecId === "A_PCM/INT/BIG" ? this.currentTrack.info.bitDepth === 8 ? this.currentTrack.info.codec = "pcm-u8" : this.currentTrack.info.bitDepth === 16 ? this.currentTrack.info.codec = "pcm-s16be" : this.currentTrack.info.bitDepth === 24 ? this.currentTrack.info.codec = "pcm-s24be" : this.currentTrack.info.bitDepth === 32 && (this.currentTrack.info.codec = "pcm-s32be") : this.currentTrack.codecId === "A_PCM/FLOAT/IEEE" && (this.currentTrack.info.bitDepth === 32 ? this.currentTrack.info.codec = "pcm-f32" : this.currentTrack.info.bitDepth === 64 && (this.currentTrack.info.codec = "pcm-f64"));
						let e = this.currentTrack;
						this.currentTrack.trackBacking = new Fi(e), this.currentSegment.tracks.push(this.currentTrack);
					}
				}
				this.currentTrack = null;
				break;
			case z.TrackNumber:
				if (!this.currentTrack) break;
				this.currentTrack.id = B(e, o);
				break;
			case z.TrackType:
				{
					if (!this.currentTrack) break;
					let t = B(e, o);
					t === 1 ? this.currentTrack.info = {
						type: "video",
						width: -1,
						height: -1,
						displayWidth: null,
						displayHeight: null,
						displayUnit: null,
						squarePixelWidth: -1,
						squarePixelHeight: -1,
						rotation: 0,
						codec: null,
						codecDescription: null,
						colorSpace: { ...b },
						alphaMode: !1,
						proresFormat: null
					} : t === 2 && (this.currentTrack.info = {
						type: "audio",
						numberOfChannels: 1,
						sampleRate: 8e3,
						bitDepth: -1,
						codec: null,
						codecDescription: null,
						aacCodecInfo: null,
						dtsFormat: null
					});
				}
				break;
			case z.FlagEnabled:
				if (!this.currentTrack) break;
				B(e, o) || (this.currentTrack = null);
				break;
			case z.FlagDefault:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.default = !!B(e, o);
				break;
			case z.FlagForced:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.forced = !!B(e, o);
				break;
			case z.FlagOriginal:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.original = !!B(e, o);
				break;
			case z.FlagHearingImpaired:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.hearingImpaired = !!B(e, o);
				break;
			case z.FlagVisualImpaired:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.visuallyImpaired = !!B(e, o);
				break;
			case z.FlagCommentary:
				if (!this.currentTrack) break;
				this.currentTrack.disposition.commentary = !!B(e, o);
				break;
			case z.CodecID:
				if (!this.currentTrack) break;
				this.currentTrack.codecId = bi(e, o);
				break;
			case z.CodecPrivate:
				if (!this.currentTrack) break;
				this.currentTrack.codecPrivate = q(e, o);
				break;
			case z.DefaultDuration:
				if (!this.currentTrack) break;
				this.currentTrack.defaultDurationNs = B(e, o);
				break;
			case z.Name:
				if (!this.currentTrack) break;
				this.currentTrack.name = xi(e, o);
				break;
			case z.Language:
				if (!this.currentTrack || this.currentTrack.hasLanguageBcp47) break;
				this.currentTrack.languageCode = bi(e, o), ye(this.currentTrack.languageCode) || (this.currentTrack.languageCode = "und");
				break;
			case z.LanguageBCP47:
				{
					if (!this.currentTrack) break;
					let t = bi(e, o).split("-")[0];
					t ? this.currentTrack.languageCode = t : this.currentTrack.languageCode = "und", this.currentTrack.hasLanguageBcp47 = !0;
				}
				break;
			case z.Video:
				if (this.currentTrack?.info?.type !== "video") break;
				this.readContiguousElements(e.slice(s, o));
				break;
			case z.PixelWidth:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.width = B(e, o);
				break;
			case z.PixelHeight:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.height = B(e, o);
				break;
			case z.DisplayWidth:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.displayWidth = B(e, o);
				break;
			case z.DisplayHeight:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.displayHeight = B(e, o);
				break;
			case z.DisplayUnit:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.displayUnit = B(e, o);
				break;
			case z.AlphaMode:
				if (this.currentTrack?.info?.type !== "video") break;
				this.currentTrack.info.alphaMode = B(e, o) === 1;
				break;
			case z.Colour:
				if (this.currentTrack?.info?.type !== "video") break;
				this.readContiguousElements(e.slice(s, o));
				break;
			case z.MatrixCoefficients:
				{
					if (this.currentTrack?.info?.type !== "video") break;
					let t = _[B(e, o)];
					this.currentTrack.info.colorSpace.matrix = t;
				}
				break;
			case z.Range:
				{
					if (this.currentTrack?.info?.type !== "video") break;
					let t = B(e, o);
					this.currentTrack.info.colorSpace.fullRange = t === 1 || t === 2 ? t === 2 : void 0;
				}
				break;
			case z.TransferCharacteristics:
				{
					if (this.currentTrack?.info?.type !== "video") break;
					let t = h[B(e, o)];
					this.currentTrack.info.colorSpace.transfer = t;
				}
				break;
			case z.Primaries:
				{
					if (this.currentTrack?.info?.type !== "video") break;
					let t = p[B(e, o)];
					this.currentTrack.info.colorSpace.primaries = t;
				}
				break;
			case z.Projection:
				if (this.currentTrack?.info?.type !== "video") break;
				this.readContiguousElements(e.slice(s, o));
				break;
			case z.ProjectionPoseRoll:
				{
					if (this.currentTrack?.info?.type !== "video") break;
					let t = -Si(e, o);
					try {
						this.currentTrack.info.rotation = n(t);
					} catch {}
				}
				break;
			case z.Audio:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.readContiguousElements(e.slice(s, o));
				break;
			case z.SamplingFrequency:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.currentTrack.info.sampleRate = Si(e, o);
				break;
			case z.Channels:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.currentTrack.info.numberOfChannels = B(e, o);
				break;
			case z.BitDepth:
				if (this.currentTrack?.info?.type !== "audio") break;
				this.currentTrack.info.bitDepth = B(e, o);
				break;
			case z.CuePoint:
				if (!this.currentSegment) break;
				this.readContiguousElements(e.slice(s, o)), this.currentCueTime = null;
				break;
			case z.CueTime:
				this.currentCueTime = B(e, o);
				break;
			case z.CueTrackPositions:
				{
					if (this.currentCueTime === null) break;
					t(this.currentSegment);
					let n = {
						time: this.currentCueTime,
						trackId: -1,
						clusterPosition: -1
					};
					this.currentSegment.cuePoints.push(n), this.readContiguousElements(e.slice(s, o)), (n.trackId === -1 || n.clusterPosition === -1) && this.currentSegment.cuePoints.pop();
				}
				break;
			case z.CueTrack:
				{
					let t = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
					if (!t) break;
					t.trackId = B(e, o);
				}
				break;
			case z.CueClusterPosition:
				{
					let n = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
					if (!n) break;
					t(this.currentSegment), n.clusterPosition = this.currentSegment.dataStartPos + B(e, o);
				}
				break;
			case z.Timestamp:
				if (!this.currentCluster) break;
				this.currentCluster.timestamp = B(e, o);
				break;
			case z.SimpleBlock:
				{
					if (!this.currentCluster) break;
					let t = hi(e);
					if (t === null) break;
					let n = this.getTrackDataInCluster(this.currentCluster, t);
					if (!n) break;
					let r = Zs(e), i = J(e), a = i >> 1 & 3, c = !!(i & 128);
					n.track.info?.type === "audio" && n.track.info.codec && (c = !0);
					let l = q(e, o - (e.filePos - s)), u = n.track.decodingInstructions.length > 0;
					n.blocks.push({
						timestamp: r,
						duration: 0,
						isKeyFrame: c,
						data: l,
						lacing: a,
						decoded: !u,
						postProcessed: !1,
						mainAdditional: null
					});
				}
				break;
			case z.BlockGroup:
				if (!this.currentCluster) break;
				this.readContiguousElements(e.slice(s, o)), this.currentBlock = null;
				break;
			case z.Block:
				{
					if (!this.currentCluster) break;
					let t = hi(e);
					if (t === null) break;
					let n = this.getTrackDataInCluster(this.currentCluster, t);
					if (!n) break;
					let r = Zs(e), i = J(e) >> 1 & 3, a = q(e, o - (e.filePos - s)), c = n.track.decodingInstructions.length > 0;
					this.currentBlock = {
						timestamp: r,
						duration: 0,
						isKeyFrame: !0,
						data: a,
						lacing: i,
						decoded: !c,
						postProcessed: !1,
						mainAdditional: null
					}, n.blocks.push(this.currentBlock);
				}
				break;
			case z.BlockAdditions:
				this.readContiguousElements(e.slice(s, o));
				break;
			case z.BlockMore:
				if (!this.currentBlock) break;
				this.currentBlockAdditional = {
					addId: 1,
					data: null
				}, this.readContiguousElements(e.slice(s, o)), this.currentBlockAdditional.data && this.currentBlockAdditional.addId === 1 && (this.currentBlock.mainAdditional = this.currentBlockAdditional.data), this.currentBlockAdditional = null;
				break;
			case z.BlockAdditional:
				if (!this.currentBlockAdditional) break;
				this.currentBlockAdditional.data = q(e, o);
				break;
			case z.BlockAddID:
				if (!this.currentBlockAdditional) break;
				this.currentBlockAdditional.addId = B(e, o);
				break;
			case z.BlockDuration:
				if (!this.currentBlock) break;
				this.currentBlock.duration = B(e, o);
				break;
			case z.ReferenceBlock:
				if (!this.currentBlock) break;
				this.currentBlock.isKeyFrame = !1;
				break;
			case z.Tag:
				this.currentTagTargetIsMovie = !0, this.readContiguousElements(e.slice(s, o));
				break;
			case z.Targets:
				this.readContiguousElements(e.slice(s, o));
				break;
			case z.TargetTypeValue:
				B(e, o) !== 50 && (this.currentTagTargetIsMovie = !1);
				break;
			case z.TagTrackUID:
			case z.TagEditionUID:
			case z.TagChapterUID:
			case z.TagAttachmentUID:
				this.currentTagTargetIsMovie = !1;
				break;
			case z.SimpleTag:
				if (!this.currentTagTargetIsMovie) break;
				this.currentSimpleTagName = null, this.readContiguousElements(e.slice(s, o));
				break;
			case z.TagName:
				this.currentSimpleTagName = xi(e, o);
				break;
			case z.TagString:
				{
					if (!this.currentSimpleTagName) break;
					let t = xi(e, o);
					this.processTagValue(this.currentSimpleTagName, t);
				}
				break;
			case z.TagBinary:
				{
					if (!this.currentSimpleTagName) break;
					let t = q(e, o);
					this.processTagValue(this.currentSimpleTagName, t);
				}
				break;
			case z.AttachedFile:
				{
					if (!this.currentSegment) break;
					this.currentAttachedFile = {
						fileUid: null,
						fileName: null,
						fileMediaType: null,
						fileData: null,
						fileDescription: null
					}, this.readContiguousElements(e.slice(s, o));
					let t = this.currentSegment.metadataTags;
					if (this.currentAttachedFile.fileUid && this.currentAttachedFile.fileData && (t.raw ??= {}, t.raw[this.currentAttachedFile.fileUid.toString()] = new Qe(this.currentAttachedFile.fileData, this.currentAttachedFile.fileMediaType ?? void 0, this.currentAttachedFile.fileName ?? void 0, this.currentAttachedFile.fileDescription ?? void 0)), this.currentAttachedFile.fileMediaType?.startsWith("image/") && this.currentAttachedFile.fileData) {
						let e = this.currentAttachedFile.fileName, n = "unknown";
						if (e) {
							let t = e.toLowerCase();
							t.startsWith("cover.") ? n = "coverFront" : t.startsWith("back.") && (n = "coverBack");
						}
						t.images ??= [], t.images.push({
							data: this.currentAttachedFile.fileData,
							mimeType: this.currentAttachedFile.fileMediaType,
							kind: n,
							name: this.currentAttachedFile.fileName ?? void 0,
							description: this.currentAttachedFile.fileDescription ?? void 0
						});
					}
					this.currentAttachedFile = null;
				}
				break;
			case z.FileUID:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileUid = gi(e, o);
				break;
			case z.FileName:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileName = xi(e, o);
				break;
			case z.FileMediaType:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileMediaType = bi(e, o);
				break;
			case z.FileData:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileData = q(e, o);
				break;
			case z.FileDescription:
				if (!this.currentAttachedFile) break;
				this.currentAttachedFile.fileDescription = xi(e, o);
				break;
			case z.ContentEncodings:
				if (!this.currentTrack) break;
				this.readContiguousElements(e.slice(s, o)), this.currentTrack.decodingInstructions.sort((e, t) => t.order - e.order);
				break;
			case z.ContentEncoding:
				this.currentDecodingInstruction = {
					order: 0,
					scope: Oi.Block,
					data: null
				}, this.readContiguousElements(e.slice(s, o)), this.currentDecodingInstruction.data && this.currentTrack.decodingInstructions.push(this.currentDecodingInstruction), this.currentDecodingInstruction = null;
				break;
			case z.ContentEncodingOrder:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.order = B(e, o);
				break;
			case z.ContentEncodingScope:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.scope = B(e, o);
				break;
			case z.ContentCompression:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.data = {
					type: "decompress",
					algorithm: ki.Zlib,
					settings: null
				}, this.readContiguousElements(e.slice(s, o));
				break;
			case z.ContentCompAlgo:
				if (this.currentDecodingInstruction?.data?.type !== "decompress") break;
				this.currentDecodingInstruction.data.algorithm = B(e, o);
				break;
			case z.ContentCompSettings:
				if (this.currentDecodingInstruction?.data?.type !== "decompress") break;
				this.currentDecodingInstruction.data.settings = q(e, o);
				break;
			case z.ContentEncryption:
				if (!this.currentDecodingInstruction) break;
				this.currentDecodingInstruction.data = { type: "decrypt" };
		}
		return e.filePos = s + o, !0;
	}
	decodeBlockData(e, n) {
		t(e.decodingInstructions.length > 0);
		let r = n;
		for (let n of e.decodingInstructions) if (t(n.data), n.data.type === "decompress") switch (n.data.algorithm) {
			case ki.HeaderStripping: if (n.data.settings && n.data.settings.length > 0) {
				let e = n.data.settings, t = new Uint8Array(e.length + r.length);
				t.set(e, 0), t.set(r, e.length), r = t;
			}
		}
		return r;
	}
	processTagValue(e, t) {
		if (!this.currentSegment?.metadataTags) return;
		let n = this.currentSegment.metadataTags;
		if (n.raw ??= {}, n.raw[e] ??= t, typeof t == "string") switch (e.toLowerCase()) {
			case "title":
				n.title ??= t;
				break;
			case "description":
				n.description ??= t;
				break;
			case "artist":
				n.artist ??= t;
				break;
			case "album":
				n.album ??= t;
				break;
			case "album_artist":
				n.albumArtist ??= t;
				break;
			case "genre":
				n.genre ??= t;
				break;
			case "comment":
				n.comment ??= t;
				break;
			case "lyrics":
				n.lyrics ??= t;
				break;
			case "date":
				{
					let e = new Date(t);
					Number.isNaN(e.getTime()) || (n.date ??= e);
				}
				break;
			case "track_number":
			case "part_number":
				{
					let e = t.split("/"), r = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(r) && r > 0 && (n.trackNumber ??= r), i && Number.isInteger(i) && i > 0 && (n.tracksTotal ??= i);
				}
				break;
			case "disc_number":
			case "disc": {
				let e = t.split("/"), r = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
				Number.isInteger(r) && r > 0 && (n.discNumber ??= r), i && Number.isInteger(i) && i > 0 && (n.discsTotal ??= i);
			}
		}
	}
}, Ni = class {
	constructor(e) {
		this.internalTrack = e, this.packetToClusterLocation = /* @__PURE__ */ new WeakMap();
	}
	getId() {
		return this.internalTrack.id;
	}
	getNumber() {
		let e = this.internalTrack.demuxer, t = this.internalTrack.trackBacking.getType(), n = 0;
		for (let r of e.segments) for (let e of r.tracks) if (e.trackBacking.getType() === t && n++, e === this.internalTrack) break;
		return n;
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getInternalCodecId() {
		return this.internalTrack.codecId;
	}
	getName() {
		return this.internalTrack.name;
	}
	getLanguageCode() {
		return this.internalTrack.languageCode;
	}
	getTimeResolution() {
		return this.internalTrack.segment.timestampFactor;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getDisposition() {
		return this.internalTrack.disposition;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		let e = this.internalTrack.segment;
		if (e.duration <= 0) return null;
		let t = e.duration / e.timestampFactor, n = await this.getFirstPacket({ metadataOnly: !0 });
		return t += n?.timestamp ?? 0, t;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	async getFirstPacket(e) {
		return this.performClusterLookup(null, (e) => e.trackData.get(this.internalTrack.id) ? {
			blockIndex: 0,
			correctBlockFound: !0
		} : {
			blockIndex: -1,
			correctBlockFound: !1
		}, -Infinity, Infinity, e);
	}
	intoTimescale(e) {
		return de(e * this.internalTrack.segment.timestampFactor);
	}
	async getPacket(e, t) {
		let n = this.intoTimescale(e);
		return this.performClusterLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				blockIndex: -1,
				correctBlockFound: !1
			};
			let r = O(t.presentationTimestamps, n, (e) => e.timestamp);
			return {
				blockIndex: r === -1 ? -1 : t.presentationTimestamps[r].blockIndex,
				correctBlockFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextPacket(e, t) {
		let n = this.packetToClusterLocation.get(e);
		if (n === void 0) throw Error("Packet was not created from this track.");
		return this.performClusterLookup(n.cluster, (e) => {
			if (e === n.cluster) {
				let t = e.trackData.get(this.internalTrack.id);
				if (n.blockIndex + 1 < t.blocks.length) return {
					blockIndex: n.blockIndex + 1,
					correctBlockFound: !0
				};
			} else if (e.trackData.get(this.internalTrack.id)) return {
				blockIndex: 0,
				correctBlockFound: !0
			};
			return {
				blockIndex: -1,
				correctBlockFound: !1
			};
		}, -Infinity, Infinity, t);
	}
	async getKeyPacket(e, t) {
		let n = this.intoTimescale(e);
		return this.performClusterLookup(null, (e) => {
			let t = e.trackData.get(this.internalTrack.id);
			if (!t) return {
				blockIndex: -1,
				correctBlockFound: !1
			};
			let r = re(t.presentationTimestamps, (e) => t.blocks[e.blockIndex].isKeyFrame && e.timestamp <= n);
			return {
				blockIndex: r === -1 ? -1 : t.presentationTimestamps[r].blockIndex,
				correctBlockFound: r !== -1 && n < t.endTimestamp
			};
		}, n, n, t);
	}
	async getNextKeyPacket(e, n) {
		let r = this.packetToClusterLocation.get(e);
		if (r === void 0) throw Error("Packet was not created from this track.");
		return this.performClusterLookup(r.cluster, (e) => {
			if (e === r.cluster) {
				let t = e.trackData.get(this.internalTrack.id).blocks.findIndex((e, t) => e.isKeyFrame && t > r.blockIndex);
				if (t !== -1) return {
					blockIndex: t,
					correctBlockFound: !0
				};
			} else {
				let n = e.trackData.get(this.internalTrack.id);
				if (n && n.firstKeyFrameTimestamp !== null) {
					let e = n.blocks.findIndex((e) => e.isKeyFrame);
					return t(e !== -1), {
						blockIndex: e,
						correctBlockFound: !0
					};
				}
			}
			return {
				blockIndex: -1,
				correctBlockFound: !1
			};
		}, -Infinity, Infinity, n);
	}
	async fetchPacketInCluster(e, n, r) {
		if (n === -1) return null;
		let i = e.trackData.get(this.internalTrack.id).blocks[n];
		if (t(i), i.decoded ||= (i.data = this.internalTrack.demuxer.decodeBlockData(this.internalTrack, i.data), !0), !i.postProcessed) {
			if (this.internalTrack.info?.codec === "prores" && !(i.data.length >= 8 && i.data[4] === 105 && i.data[5] === 99 && i.data[6] === 112 && i.data[7] === 102)) {
				let e = new Uint8Array(i.data.length + 8);
				c(e).setUint32(0, e.length, !1), e[4] = 105, e[5] = 99, e[6] = 112, e[7] = 102, e.set(i.data, 8), i.data = e;
			}
			i.postProcessed = !0;
		}
		let a = r.metadataOnly ? I : i.data, o = i.timestamp / this.internalTrack.segment.timestampFactor, s = i.duration / this.internalTrack.segment.timestampFactor, l = {};
		i.mainAdditional && this.internalTrack.info?.type === "video" && this.internalTrack.info.alphaMode && (l.alpha = r.metadataOnly ? I : i.mainAdditional, l.alphaByteLength = i.mainAdditional.byteLength);
		let u = new L(a, i.isKeyFrame ? "key" : "delta", o, s, e.dataStartPos + n, i.data.byteLength, l);
		return this.packetToClusterLocation.set(u, {
			cluster: e,
			blockIndex: n
		}), u;
	}
	async performClusterLookup(e, n, r, i, a) {
		let { demuxer: o, segment: s } = this.internalTrack, c = null, l = null, u = -1;
		if (e) {
			let { blockIndex: t, correctBlockFound: r } = n(e);
			if (r) return this.fetchPacketInCluster(e, t, a);
			t !== -1 && (l = e, u = t);
		}
		let d = O(this.internalTrack.cuePoints, r, (e) => e.time), f = d === -1 ? null : this.internalTrack.cuePoints[d], p = O(this.internalTrack.clusterPositionCache, r, (e) => e.startTimestamp), m = p === -1 ? null : this.internalTrack.clusterPositionCache[p], h = Math.max(f?.clusterPosition ?? 0, m?.elementStartPos ?? 0) || null, g;
		for (e ? h === null || e.elementStartPos >= h ? (g = e.elementEndPos, c = e) : g = h : g = h ?? s.clusterSeekStartPos; s.elementEndPos === null || g <= s.elementEndPos - 2;) {
			if (c) {
				let e = c.trackData.get(this.internalTrack.id);
				if (e && e.startTimestamp > i) break;
			}
			let e = o.reader.requestSliceRange(g, 2, 16);
			if (A(e) && (e = await e), !e) break;
			let r = g, d = yi(e);
			if (!d || !si.includes(d.id) && d.id !== z.Void) {
				let e = await wi(o.reader, r, si, Math.min(s.elementEndPos ?? Infinity, r + ji));
				if (e) {
					g = e;
					continue;
				}
				break;
			}
			let f = d.id, p = d.size, m = e.filePos;
			if (f === z.Cluster) {
				c = await o.readCluster(r, s), p = c.elementEndPos - m;
				let { blockIndex: e, correctBlockFound: t } = n(c);
				if (t) return this.fetchPacketInCluster(c, e, a);
				e !== -1 && (l = c, u = e);
			}
			p === void 0 && (t(f !== z.Cluster), p = (await Ci(o.reader, m, ci, s.elementEndPos)).pos - m);
			let h = m + p;
			if (s.elementEndPos === null) {
				let e = o.reader.requestSliceRange(h, 2, 16);
				if (A(e) && (e = await e), !e) break;
				if (_i(e) === z.Segment) {
					s.elementEndPos = h;
					break;
				}
			}
			g = h;
		}
		if (f && (!l || l.elementStartPos < f.clusterPosition)) {
			let e = this.internalTrack.cuePoints[d - 1];
			t(!e || e.time < f.time);
			let r = e?.time ?? -Infinity;
			return this.performClusterLookup(null, n, r, i, a);
		}
		return l ? this.fetchPacketInCluster(l, u, a) : null;
	}
}, Pi = class extends Ni {
	constructor(e) {
		super(e), this.decoderConfigPromise = null, this.internalTrack = e;
	}
	getType() {
		return "video";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getCodedWidth() {
		return this.internalTrack.info.width;
	}
	getCodedHeight() {
		return this.internalTrack.info.height;
	}
	getSquarePixelWidth() {
		return this.internalTrack.info.squarePixelWidth;
	}
	getSquarePixelHeight() {
		return this.internalTrack.info.squarePixelHeight;
	}
	getRotation() {
		return this.internalTrack.info.rotation;
	}
	async getColorSpace() {
		let e = await this.getDecoderConfig();
		return e ? {
			primaries: e.colorSpace?.primaries,
			transfer: e.colorSpace?.transfer,
			matrix: e.colorSpace?.matrix,
			fullRange: e.colorSpace?.fullRange
		} : this.internalTrack.info.colorSpace;
	}
	async canBeTransparent() {
		return this.internalTrack.info.alphaMode || this.internalTrack.info.codec === "prores" && (this.internalTrack.info.proresFormat === "ap4h" || this.internalTrack.info.proresFormat === "ap4x");
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
			let e = null;
			(this.internalTrack.info.codec === "vp9" || this.internalTrack.info.codec === "av1" || this.internalTrack.info.codec === "prores" || this.internalTrack.info.codec === "avc" && !this.internalTrack.info.codecDescription || this.internalTrack.info.codec === "hevc" && !this.internalTrack.info.codecDescription) && (e = await this.getFirstPacket({}));
			let t = {
				width: this.internalTrack.info.width,
				height: this.internalTrack.info.height,
				codec: this.internalTrack.info.codec,
				codecDescription: this.internalTrack.info.codecDescription,
				colorSpace: this.internalTrack.info.colorSpace,
				avcType: 1,
				avcCodecInfo: this.internalTrack.info.codec === "avc" && e ? St(e.data) : null,
				hevcCodecInfo: this.internalTrack.info.codec === "hevc" && e ? jt(e.data) : null,
				vp9CodecInfo: this.internalTrack.info.codec === "vp9" && e ? Ht(e.data) : null,
				av1CodecInfo: this.internalTrack.info.codec === "av1" && e ? Gt(e.data) : null,
				proresCodecInfo: this.internalTrack.info.codec === "prores" && e ? qt(e.data) : null,
				proresFormat: this.internalTrack.info.proresFormat
			};
			if (!v(this.internalTrack.info.colorSpace)) {
				let e = qn(t);
				this.internalTrack.info.colorSpace.primaries ??= e.primaries, this.internalTrack.info.colorSpace.transfer ??= e.transfer, this.internalTrack.info.colorSpace.matrix ??= e.matrix, this.internalTrack.info.colorSpace.fullRange ??= e.fullRange;
			}
			let n = {
				codec: Kn(t),
				codedWidth: this.internalTrack.info.width,
				codedHeight: this.internalTrack.info.height,
				description: this.internalTrack.info.codecDescription ?? void 0,
				colorSpace: this.internalTrack.info.colorSpace
			};
			return (this.internalTrack.info.width !== this.internalTrack.info.squarePixelWidth || this.internalTrack.info.height !== this.internalTrack.info.squarePixelHeight) && (n.displayAspectWidth = this.internalTrack.info.squarePixelWidth, n.displayAspectHeight = this.internalTrack.info.squarePixelHeight), n;
		})() : null;
	}
}, Fi = class extends Ni {
	constructor(e) {
		super(e), this.decoderConfigPromise = null, this.internalTrack = e;
	}
	getType() {
		return "audio";
	}
	getCodec() {
		return this.internalTrack.info.codec;
	}
	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels;
	}
	getSampleRate() {
		return this.internalTrack.info.sampleRate;
	}
	async getDecoderConfig() {
		return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
			if (this.internalTrack.info.codec === "dts" && !this.internalTrack.info.dtsFormat) {
				let e = await this.getFirstPacket({});
				this.internalTrack.info.dtsFormat = e && wn(e.data);
			}
			return {
				codec: Jn({
					codec: this.internalTrack.info.codec,
					codecDescription: this.internalTrack.info.codecDescription,
					aacCodecInfo: this.internalTrack.info.aacCodecInfo,
					dtsFormat: this.internalTrack.info.dtsFormat
				}),
				numberOfChannels: this.internalTrack.info.numberOfChannels,
				sampleRate: this.internalTrack.info.sampleRate,
				description: this.internalTrack.info.codecDescription ?? void 0
			};
		})() : null;
	}
}, Ii = async (e, t, n, r = null) => {
	let i = 2 ** 16, a = t;
	for (; n === null || a < n;) {
		let t = n === null ? i : Math.min(i, n - a), o = e.requestSliceRange(a, 4, t);
		if (A(o) && (o = await o), !o || o.length < 4) break;
		for (; o.remainingLength >= 4;) {
			let t = o.filePos, n = mr(X(o), e.fileSize === null ? null : e.fileSize - a);
			if (n.header && (!r || n.header.sampleRate === r.sampleRate && n.header.mpegVersionId === r.mpegVersionId && n.header.layer === r.layer && _r(n.header.channel) === _r(r.channel))) return {
				header: n.header,
				startPos: a
			};
			o.filePos = t + n.bytesAdvanced, a = o.filePos;
		}
	}
	return null;
}, Li = class extends vr {
	constructor(e) {
		super(e), this.metadataPromise = null, this.firstFrameHeader = null, this.firstFrameHeaderPos = null, this.xingFrameHeader = null, this.xingFrameHeaderPos = null, this.loadedSamples = [], this.metadataTags = null, this.xingData = null, this.trackBackings = [], this.readingMutex = new S(), this.lastSampleLoaded = !1, this.lastLoadedPos = 0, this.nextTimestampInSamples = 0, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			for (; !this.firstFrameHeader && !this.lastSampleLoaded;) await this.advanceReader();
			if (!this.firstFrameHeader && this.xingFrameHeader && (this.firstFrameHeader = this.xingFrameHeader, this.firstFrameHeaderPos = this.xingFrameHeaderPos), !this.firstFrameHeader) throw Error("No valid MP3 frame found.");
			this.trackBackings = [new Ri(this)];
		})();
	}
	async advanceReader() {
		if (this.lastLoadedPos === 0) for (;;) {
			let e = this.reader.requestSlice(this.lastLoadedPos, 10);
			if (A(e) && (e = await e), !e) {
				this.lastSampleLoaded = !0;
				return;
			}
			let t = pc(e);
			if (!t) break;
			this.lastLoadedPos = e.filePos + t.size;
		}
		let e = await Ii(this.reader, this.lastLoadedPos, this.reader.fileSize, this.firstFrameHeader);
		if (!e) {
			this.lastSampleLoaded = !0;
			return;
		}
		let t = e.header;
		this.lastLoadedPos = e.startPos + t.totalSize - 1;
		let n = pr(t.mpegVersionId, t.channel), r = this.reader.requestSlice(e.startPos + n, 4);
		if (A(r) && (r = await r), r) {
			let i = X(r);
			if (i === 1483304551 || i === 1231971951) {
				if (this.xingFrameHeader || (this.xingFrameHeader = t, this.xingFrameHeaderPos = e.startPos), !this.xingData) {
					let t = this.reader.requestSlice(e.startPos + n + 4, 12);
					if (A(t) && (t = await t), t) {
						let e = c(q(t, 12)), n = e.getUint32(0, !1);
						this.xingData = {
							frameCount: n & gr.FrameCount ? e.getUint32(4, !1) : null,
							fileSize: n & gr.FileSize ? e.getUint32(8, !1) : null
						};
					}
				}
				return;
			}
		}
		this.firstFrameHeader || (this.firstFrameHeader = t, this.firstFrameHeaderPos = e.startPos);
		let i = t.audioSamplesInFrame / this.firstFrameHeader.sampleRate, a = {
			timestamp: this.nextTimestampInSamples / this.firstFrameHeader.sampleRate,
			duration: i,
			dataStart: e.startPos,
			dataSize: t.totalSize
		};
		this.loadedSamples.push(a), this.nextTimestampInSamples += t.audioSamplesInFrame;
	}
	async getMimeType() {
		return "audio/mpeg";
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		let e = await this.readingMutex.acquire();
		try {
			if (await this.readMetadata(), this.metadataTags) return this.metadataTags;
			this.metadataTags = {};
			let e = 0, n = !1;
			for (;;) {
				let t = this.reader.requestSlice(e, 10);
				if (A(t) && (t = await t), !t) break;
				let r = pc(t);
				if (!r) break;
				n = !0;
				let i = this.reader.requestSlice(t.filePos, r.size);
				if (A(i) && (i = await i), !i) break;
				mc(i, r, this.metadataTags), e = t.filePos + r.size;
			}
			if (!n && this.reader.fileSize !== null && this.reader.fileSize >= 128) {
				let e = this.reader.requestSlice(this.reader.fileSize - 128, 128);
				A(e) && (e = await e), t(e), Q(e, 3) === "TAG" && dc(e, this.metadataTags);
			}
			return this.metadataTags;
		} finally {
			e();
		}
	}
}, Ri = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getTimeResolution() {
		return t(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.sampleRate / this.demuxer.firstFrameHeader.audioSamplesInFrame;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		let e = this.demuxer;
		if (t(e.firstFrameHeader !== null), t(e.firstFrameHeaderPos !== null), e.xingData) {
			if (e.xingData.frameCount !== null) return e.xingData.frameCount * e.firstFrameHeader.audioSamplesInFrame / e.firstFrameHeader.sampleRate;
		} else if (e.reader.fileSize !== null) {
			let t = fr(e.firstFrameHeader.lowSamplingFrequency, e.firstFrameHeader.layer, e.firstFrameHeader.bitrate, e.firstFrameHeader.sampleRate), n = (e.reader.fileSize - e.firstFrameHeaderPos) / t;
			return Math.round(n) * e.firstFrameHeader.audioSamplesInFrame / e.firstFrameHeader.sampleRate;
		}
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getCodec() {
		return "mp3";
	}
	getInternalCodecId() {
		return null;
	}
	getNumberOfChannels() {
		return t(this.demuxer.firstFrameHeader), _r(this.demuxer.firstFrameHeader.channel);
	}
	getSampleRate() {
		return t(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.sampleRate;
	}
	getDisposition() {
		return { ...et };
	}
	async getDecoderConfig() {
		return t(this.demuxer.firstFrameHeader), {
			codec: "mp3",
			numberOfChannels: _r(this.demuxer.firstFrameHeader.channel),
			sampleRate: this.demuxer.firstFrameHeader.sampleRate
		};
	}
	async getPacketAtIndex(e, t) {
		if (e === -1) return null;
		let n = this.demuxer.loadedSamples[e];
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = I;
		else {
			let e = this.demuxer.reader.requestSlice(n.dataStart, n.dataSize);
			if (A(e) && (e = await e), !e) return null;
			r = q(e, n.dataSize);
		}
		return new L(r, "key", n.timestamp, n.duration, e, n.dataSize);
	}
	getFirstPacket(e) {
		return this.getPacketAtIndex(0, e);
	}
	async getNextPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			let n = D(this.demuxer.loadedSamples, e.timestamp, (e) => e.timestamp);
			if (n === -1) throw Error("Packet was not created from this track.");
			let r = n + 1;
			for (; r >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(r, t);
		} finally {
			n();
		}
	}
	async getPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			for (;;) {
				let n = O(this.demuxer.loadedSamples, e, (e) => e.timestamp);
				if (n === -1 && this.demuxer.loadedSamples.length > 0) return null;
				if (this.demuxer.lastSampleLoaded || n >= 0 && n + 1 < this.demuxer.loadedSamples.length) return this.getPacketAtIndex(n, t);
				await this.demuxer.advanceReader();
			}
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, zi = 79764919, Bi = /* @__PURE__ */ new Uint32Array(256);
for (let e = 0; e < 256; e++) {
	let t = e << 24;
	for (let e = 0; e < 8; e++) t = t & 2147483648 ? t << 1 ^ zi : t << 1;
	Bi[e] = t >>> 0 & 4294967295;
}
var Vi = (e) => {
	let t = c(e), n = t.getUint32(22, !0);
	t.setUint32(22, 0, !0);
	let r = 0;
	for (let t = 0; t < e.length; t++) {
		let n = e[t];
		r = (r << 8 ^ Bi[r >>> 24 ^ n]) >>> 0;
	}
	return t.setUint32(22, n, !0), r;
}, Hi = (e, n, r) => {
	let i = 0, a = null;
	if (e.length > 0) {
		if (n.codec === "vorbis") {
			t(n.vorbisInfo);
			let o = n.vorbisInfo.modeBlockflags.length, s = (1 << ge(o - 1)) - 1 << 1, c = (e[0] & s) >> 1;
			if (c >= n.vorbisInfo.modeBlockflags.length) throw Error("Invalid mode number.");
			let l = r, u = n.vorbisInfo.modeBlockflags[c];
			if (a = n.vorbisInfo.blocksizes[u], u === 1) {
				let t = (s | 1) + 1, r = e[0] & t ? 1 : 0;
				l = n.vorbisInfo.blocksizes[r];
			}
			i = l === null ? 0 : l + a >> 2;
		} else n.codec === "opus" && (i = Xt(e).durationInSamples);
	}
	return {
		durationInSamples: i,
		vorbisBlockSize: a
	};
}, Ui = (e) => {
	let t = "audio/ogg";
	if (e.codecStrings) {
		let n = [...new Set(e.codecStrings)];
		t += `; codecs="${n.join(", ")}"`;
	}
	return t;
}, Wi = 65307, Gi = (e) => {
	let t = e.filePos;
	if ($s(e) !== 1399285583) return null;
	e.skip(1);
	let n = J(e), r = ic(e), i = $s(e), a = $s(e), o = $s(e), s = J(e), c = new Uint8Array(s);
	for (let t = 0; t < s; t++) c[t] = J(e);
	let l = 27 + s, u = c.reduce((e, t) => e + t, 0);
	return {
		headerStartPos: t,
		totalSize: l + u,
		dataStartPos: t + l,
		dataSize: u,
		headerType: n,
		granulePosition: r,
		serialNumber: i,
		sequenceNumber: a,
		checksum: o,
		lacingValues: c
	};
}, Ki = (e, t) => {
	for (; e.filePos < t - 3;) {
		let t = $s(e), n = t & 255, r = t >>> 8 & 255, i = t >>> 16 & 255, a = t >>> 24 & 255;
		if (n === 79 || r === 79 || i === 79 || a === 79) {
			if (e.skip(-4), t === 1399285583) return !0;
			e.skip(1);
		}
	}
	return !1;
}, qi = class extends vr {
	constructor(e) {
		super(e), this.metadataPromise = null, this.bitstreams = [], this.trackBackings = [], this.metadataTags = {}, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = 0;
			for (;;) {
				let t = this.reader.requestSliceRange(e, 27, 282);
				if (A(t) && (t = await t), !t) break;
				let n = Gi(t);
				if (!n || !(n.headerType & 2)) break;
				this.bitstreams.push({
					serialNumber: n.serialNumber,
					bosPage: n,
					description: null,
					numberOfChannels: -1,
					sampleRate: -1,
					codecInfo: {
						codec: null,
						vorbisInfo: null,
						opusInfo: null
					},
					lastMetadataPacket: null
				}), e = n.headerStartPos + n.totalSize;
			}
			for (let e of this.bitstreams) {
				let t = await this.readPacket(e.bosPage, 0);
				t && (t.data.byteLength >= 7 && t.data[0] === 1 && t.data[1] === 118 && t.data[2] === 111 && t.data[3] === 114 && t.data[4] === 98 && t.data[5] === 105 && t.data[6] === 115 ? await this.readVorbisMetadata(t, e) : t.data.byteLength >= 8 && t.data[0] === 79 && t.data[1] === 112 && t.data[2] === 117 && t.data[3] === 115 && t.data[4] === 72 && t.data[5] === 101 && t.data[6] === 97 && t.data[7] === 100 && await this.readOpusMetadata(t, e), e.codecInfo.codec !== null && this.trackBackings.push(new Ji(e, this)));
			}
		})();
	}
	async readVorbisMetadata(e, t) {
		let n = await this.findNextPacketStart(e);
		if (!n) return;
		let r = await this.readPacket(n.startPage, n.startSegmentIndex);
		if (!r || (n = await this.findNextPacketStart(r), !n)) return;
		let i = await this.readPacket(n.startPage, n.startSegmentIndex);
		if (!i || r.data[0] !== 3 || i.data[0] !== 5) return;
		let a = [], o = (e) => {
			for (; a.push(Math.min(255, e)), !(e < 255);) e -= 255;
		};
		o(e.data.length), o(r.data.length);
		let s = new Uint8Array(1 + a.length + e.data.length + r.data.length + i.data.length);
		s[0] = 2, s.set(a, 1), s.set(e.data, 1 + a.length), s.set(r.data, 1 + a.length + e.data.length), s.set(i.data, 1 + a.length + e.data.length + r.data.length), t.codecInfo.codec = "vorbis", t.description = s, t.lastMetadataPacket = i;
		let l = c(e.data);
		t.numberOfChannels = l.getUint8(11), t.sampleRate = l.getUint32(12, !0);
		let u = l.getUint8(28);
		t.codecInfo.vorbisInfo = {
			blocksizes: [1 << (u & 15), 1 << (u >> 4)],
			modeBlockflags: Zt(i.data).modeBlockflags
		}, en(r.data.subarray(7), this.metadataTags);
	}
	async readOpusMetadata(e, t) {
		let n = await this.findNextPacketStart(e);
		if (!n) return;
		let r = await this.readPacket(n.startPage, n.startSegmentIndex);
		if (!r) return;
		t.codecInfo.codec = "opus", t.description = e.data, t.lastMetadataPacket = r;
		let i = Jt(e.data);
		t.numberOfChannels = i.outputChannelCount, t.sampleRate = Yn, t.codecInfo.opusInfo = { preSkip: i.preSkip }, en(r.data.subarray(8), this.metadataTags);
	}
	async readPacket(e, n) {
		t(n < e.lacingValues.length);
		let r = 0;
		for (let t = 0; t < n; t++) r += e.lacingValues[t];
		let i = e, a = r, o = n, s = [];
		outer: for (;;) {
			let n = this.reader.requestSlice(i.dataStartPos, i.dataSize);
			A(n) && (n = await n), t(n);
			let c = q(n, i.dataSize);
			for (;;) {
				if (o === i.lacingValues.length) {
					s.push(c.subarray(r, a));
					break;
				}
				let e = i.lacingValues[o];
				if (a += e, e < 255) {
					s.push(c.subarray(r, a));
					break outer;
				}
				o++;
			}
			let l = i.headerStartPos + i.totalSize;
			for (;;) {
				let t = this.reader.requestSliceRange(l, 27, 282);
				if (A(t) && (t = await t), !t) return null;
				let n = Gi(t);
				if (!n) return null;
				if (i = n, i.serialNumber === e.serialNumber) break;
				l = i.headerStartPos + i.totalSize;
			}
			r = 0, a = 0, o = 0;
		}
		let c = s.reduce((e, t) => e + t.length, 0);
		if (c === 0) return null;
		let l = new Uint8Array(c), u = 0;
		for (let e = 0; e < s.length; e++) {
			let t = s[e];
			l.set(t, u), u += t.length;
		}
		return {
			data: l,
			endPage: i,
			endSegmentIndex: o
		};
	}
	async findNextPacketStart(e) {
		if (e.endSegmentIndex < e.endPage.lacingValues.length - 1) return {
			startPage: e.endPage,
			startSegmentIndex: e.endSegmentIndex + 1
		};
		if (e.endPage.headerType & 4) return null;
		let t = e.endPage.headerStartPos + e.endPage.totalSize;
		for (;;) {
			let n = this.reader.requestSliceRange(t, 27, 282);
			if (A(n) && (n = await n), !n) return null;
			let r = Gi(n);
			if (!r) return null;
			if (r.serialNumber === e.endPage.serialNumber) return {
				startPage: r,
				startSegmentIndex: 0
			};
			t = r.headerStartPos + r.totalSize;
		}
	}
	async getMimeType() {
		return await this.readMetadata(), Ui({ codecStrings: (await Promise.all(this.trackBackings.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)))).filter(Boolean) });
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
}, Ji = class {
	constructor(e, t) {
		this.bitstream = e, this.demuxer = t, this.encodedPacketToMetadata = /* @__PURE__ */ new WeakMap(), this.sequentialScanCache = [], this.sequentialScanMutex = new S(), this.internalSampleRate = e.codecInfo.codec === "opus" ? Yn : e.sampleRate;
	}
	getType() {
		return "audio";
	}
	getId() {
		return this.bitstream.serialNumber;
	}
	getNumber() {
		let e = this.demuxer.trackBackings.findIndex((e) => e.bitstream === this.bitstream);
		return t(e !== -1), e + 1;
	}
	getNumberOfChannels() {
		return this.bitstream.numberOfChannels;
	}
	getSampleRate() {
		return this.bitstream.sampleRate;
	}
	getTimeResolution() {
		return this.bitstream.sampleRate;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getCodec() {
		return this.bitstream.codecInfo.codec;
	}
	getInternalCodecId() {
		return null;
	}
	async getDecoderConfig() {
		return t(this.bitstream.codecInfo.codec), {
			codec: this.bitstream.codecInfo.codec,
			numberOfChannels: this.bitstream.numberOfChannels,
			sampleRate: this.bitstream.sampleRate,
			description: this.bitstream.description ?? void 0
		};
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getDisposition() {
		return {
			...et,
			primary: !1
		};
	}
	granulePositionToTimestampInSamples(e) {
		return this.bitstream.codecInfo.codec === "opus" ? (t(this.bitstream.codecInfo.opusInfo), e - this.bitstream.codecInfo.opusInfo.preSkip) : e;
	}
	createEncodedPacketFromOggPacket(e, t, n) {
		if (!e) return null;
		let { durationInSamples: r, vorbisBlockSize: i } = Hi(e.data, this.bitstream.codecInfo, t.vorbisLastBlocksize), a = new L(n.metadataOnly ? I : e.data, "key", Math.max(0, t.timestampInSamples) / this.internalSampleRate, r / this.internalSampleRate, e.endPage.headerStartPos + e.endSegmentIndex, e.data.byteLength);
		return this.encodedPacketToMetadata.set(a, {
			packet: e,
			timestampInSamples: t.timestampInSamples,
			durationInSamples: r,
			vorbisLastBlockSize: t.vorbisLastBlocksize,
			vorbisBlockSize: i
		}), a;
	}
	async getFirstPacket(e) {
		t(this.bitstream.lastMetadataPacket);
		let n = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
		if (!n) return null;
		let r = 0;
		this.bitstream.codecInfo.codec === "opus" && (t(this.bitstream.codecInfo.opusInfo), r -= this.bitstream.codecInfo.opusInfo.preSkip);
		let i = await this.demuxer.readPacket(n.startPage, n.startSegmentIndex);
		return this.createEncodedPacketFromOggPacket(i, {
			timestampInSamples: r,
			vorbisLastBlocksize: null
		}, e);
	}
	async getNextPacket(e, t) {
		let n = this.encodedPacketToMetadata.get(e);
		if (!n) throw Error("Packet was not created from this track.");
		let r = await this.demuxer.findNextPacketStart(n.packet);
		if (!r) return null;
		let i = n.timestampInSamples + n.durationInSamples, a = await this.demuxer.readPacket(r.startPage, r.startSegmentIndex);
		return this.createEncodedPacketFromOggPacket(a, {
			timestampInSamples: i,
			vorbisLastBlocksize: n.vorbisBlockSize
		}, t);
	}
	async getPacket(e, n) {
		if (this.demuxer.reader.fileSize === null) return this.getPacketSequential(e, n);
		let r = de(e * this.internalSampleRate);
		if (r === 0) return this.getFirstPacket(n);
		if (r < 0) return null;
		t(this.bitstream.lastMetadataPacket);
		let i = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
		if (!i) return null;
		let a = i.startPage, o = this.demuxer.reader.fileSize, s = [a];
		outer: for (; a.headerStartPos + a.totalSize < o;) {
			let e = a.headerStartPos, n = Math.floor((e + o) / 2), i = n;
			for (;;) {
				let e = Math.min(i + Wi, o - 27), c = this.demuxer.reader.requestSlice(i, e - i);
				if (A(c) && (c = await c), t(c), !Ki(c, e)) {
					o = n + 27;
					continue outer;
				}
				let l = this.demuxer.reader.requestSliceRange(c.filePos, 27, 282);
				A(l) && (l = await l), t(l);
				let u = Gi(l);
				t(u);
				let d = !1;
				if (u.serialNumber === this.bitstream.serialNumber) d = !0;
				else {
					let e = this.demuxer.reader.requestSlice(u.headerStartPos, u.totalSize);
					A(e) && (e = await e), t(e), d = Vi(q(e, u.totalSize)) === u.checksum;
				}
				if (!d) {
					i = u.headerStartPos + 4;
					continue;
				}
				if (d && u.serialNumber !== this.bitstream.serialNumber) {
					i = u.headerStartPos + u.totalSize;
					continue;
				}
				if (u.granulePosition === -1) {
					i = u.headerStartPos + u.totalSize;
					continue;
				}
				this.granulePositionToTimestampInSamples(u.granulePosition) > r ? o = u.headerStartPos : (a = u, s.push(u));
				continue outer;
			}
		}
		let c = i.startPage;
		for (let e of s) {
			if (e.granulePosition === a.granulePosition) break;
			(!c || e.headerStartPos > c.headerStartPos) && (c = e);
		}
		let l = c, u = [l];
		for (; l.serialNumber !== this.bitstream.serialNumber || l.granulePosition !== a.granulePosition;) {
			let e = l.headerStartPos + l.totalSize, n = this.demuxer.reader.requestSliceRange(e, 27, 282);
			A(n) && (n = await n), t(n);
			let r = Gi(n);
			t(r), l = r, l.serialNumber === this.bitstream.serialNumber && u.push(l);
		}
		t(l.granulePosition !== -1);
		let d = null, f, p, m = l, h = 0;
		if (l.headerStartPos === i.startPage.headerStartPos) f = this.granulePositionToTimestampInSamples(0), p = !0, d = 0;
		else {
			f = 0, p = !1;
			for (let e = l.lacingValues.length - 1; e >= 0; e--) if (l.lacingValues[e] < 255) {
				d = e + 1;
				break;
			}
			if (d === null) throw Error("Invalid page with granule position: no packets end on this page.");
			h = d - 1;
			let e = {
				data: I,
				endPage: m,
				endSegmentIndex: h
			};
			if (await this.demuxer.findNextPacketStart(e)) {
				let e = Xi(u, l, d);
				t(e);
				let n = Yi(u, e.page, e.segmentIndex);
				n && (l = n.page, d = n.segmentIndex);
			} else for (;;) {
				let e = Xi(u, l, d);
				if (!e) break;
				let t = Yi(u, e.page, e.segmentIndex);
				if (!t) break;
				if (l = t.page, d = t.segmentIndex, e.page.headerStartPos !== m.headerStartPos) {
					m = e.page, h = e.segmentIndex;
					break;
				}
			}
		}
		let g = null, _ = null;
		for (; l !== null;) {
			t(d !== null);
			let e = await this.demuxer.readPacket(l, d);
			if (!e) break;
			if (!(l.headerStartPos === i.startPage.headerStartPos && d < i.startSegmentIndex)) {
				let i = this.createEncodedPacketFromOggPacket(e, {
					timestampInSamples: f,
					vorbisLastBlocksize: _?.vorbisBlockSize ?? null
				}, n);
				t(i);
				let a = this.encodedPacketToMetadata.get(i);
				if (t(a), !p && e.endPage.headerStartPos === m.headerStartPos && e.endSegmentIndex === h ? (f = this.granulePositionToTimestampInSamples(l.granulePosition), p = !0, i = this.createEncodedPacketFromOggPacket(e, {
					timestampInSamples: f - a.durationInSamples,
					vorbisLastBlocksize: _?.vorbisBlockSize ?? null
				}, n), t(i), a = this.encodedPacketToMetadata.get(i), t(a)) : f += a.durationInSamples, g = i, _ = a, p && (Math.max(f, 0) > r || Math.max(a.timestampInSamples, 0) === r)) break;
			}
			let a = await this.demuxer.findNextPacketStart(e);
			if (!a) break;
			l = a.startPage, d = a.startSegmentIndex;
		}
		return g;
	}
	async getPacketSequential(e, n) {
		let i = await this.sequentialScanMutex.acquire();
		try {
			let i = de(e * this.internalSampleRate);
			e = i / this.internalSampleRate;
			let a = O(this.sequentialScanCache, i, (e) => e.timestampInSamples), o;
			if (a !== -1) {
				let e = this.sequentialScanCache[a];
				o = this.createEncodedPacketFromOggPacket(e.packet, {
					timestampInSamples: e.timestampInSamples,
					vorbisLastBlocksize: e.vorbisLastBlockSize
				}, n);
			} else o = await this.getFirstPacket(n);
			let s = 0;
			for (; o && o.timestamp < e;) {
				let i = await this.getNextPacket(o, n);
				if (!i || i.timestamp > e) break;
				if (o = i, s++, s === 100) {
					s = 0;
					let e = this.encodedPacketToMetadata.get(o);
					t(e), this.sequentialScanCache.length > 0 && t(r(this.sequentialScanCache).timestampInSamples <= e.timestampInSamples), this.sequentialScanCache.push(e);
				}
			}
			return o;
		} finally {
			i();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, Yi = (e, n, r) => {
	let i = n, a = r;
	outer: for (;;) {
		for (a--; a >= 0; a--) if (i.lacingValues[a] < 255) {
			a++;
			break outer;
		}
		if (t(a === -1), !(i.headerType & 1)) {
			a = 0;
			break;
		}
		let n = ne(e, (e) => e.headerStartPos < i.headerStartPos);
		if (!n) return null;
		i = n, a = i.lacingValues.length;
	}
	if (t(a !== -1), a === i.lacingValues.length) {
		let n = e[e.indexOf(i) + 1];
		t(n), i = n, a = 0;
	}
	return {
		page: i,
		segmentIndex: a
	};
}, Xi = (e, t, n) => {
	if (n > 0) return {
		page: t,
		segmentIndex: n - 1
	};
	let r = ne(e, (e) => e.headerStartPos < t.headerStartPos);
	return r ? {
		page: r,
		segmentIndex: r.lacingValues.length - 1
	} : null;
}, H;
(function(e) {
	e[e.PCM = 1] = "PCM", e[e.IEEE_FLOAT = 3] = "IEEE_FLOAT", e[e.ALAW = 6] = "ALAW", e[e.MULAW = 7] = "MULAW", e[e.EXTENSIBLE = 65534] = "EXTENSIBLE";
})(H ||= {});
var Zi = class extends vr {
	constructor(e) {
		super(e), this.metadataPromise = null, this.dataStart = -1, this.dataSize = -1, this.audioInfo = null, this.trackBackings = [], this.lastKnownPacketIndex = 0, this.metadataTags = {}, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = this.reader.requestSlice(0, 12);
			A(e) && (e = await e), t(e);
			let n = Q(e, 4), r = n !== "RIFX", i = n === "RF64", a = Qs(e, r), o = i ? this.reader.fileSize : Math.min(a + 8, this.reader.fileSize ?? Infinity);
			if (Q(e, 4) !== "WAVE") throw Error("Invalid WAVE file - wrong format");
			let s = 0, c = null, l = e.filePos;
			for (; o === null || l < o;) {
				let e = this.reader.requestSlice(l, 8);
				if (A(e) && (e = await e), !e) break;
				let t = Q(e, 4), n = Qs(e, r), a = e.filePos;
				if (i && s === 0 && t !== "ds64") throw Error("Invalid RF64 file: First chunk must be \"ds64\".");
				if (t === "fmt ") await this.parseFmtChunk(a, n, r);
				else if (t === "data") {
					if (c ??= n, this.dataStart = e.filePos, this.dataSize = Math.min(c, (o ?? Infinity) - this.dataStart), this.reader.fileSize === null) break;
				} else if (t === "ds64") {
					let e = this.reader.requestSlice(a, n);
					if (A(e) && (e = await e), !e) break;
					let t = nc(e, r);
					c = nc(e, r), o = Math.min(t + 8, this.reader.fileSize ?? Infinity);
				} else t === "LIST" ? await this.parseListChunk(a, n, r) : (t === "ID3 " || t === "id3 ") && await this.parseId3Chunk(a, n);
				l = a + n + (n & 1), s++;
			}
			if (!this.audioInfo) throw Error("Invalid WAVE file - missing \"fmt \" chunk");
			if (this.dataStart === -1) throw Error("Invalid WAVE file - missing \"data\" chunk");
			let u = this.audioInfo.blockSizeInBytes;
			this.dataSize = Math.floor(this.dataSize / u) * u, this.trackBackings.push(new $i(this));
		})();
	}
	async parseFmtChunk(e, t, n) {
		let r = this.reader.requestSlice(e, t);
		if (A(r) && (r = await r), !r) return;
		let i = Ys(r, n), a = Ys(r, n), o = Qs(r, n);
		r.skip(4);
		let s = Ys(r, n), c;
		if (c = t === 14 ? 8 : Ys(r, n), t >= 18 && i !== 357) {
			let e = Ys(r, n), a = t - 18;
			if (Math.min(a, e) >= 22 && i === H.EXTENSIBLE) {
				r.skip(6);
				let e = q(r, 16);
				i = e[0] | e[1] << 8;
			}
		}
		if ((i === H.MULAW || i === H.ALAW) && (c = 8), i !== H.PCM && i !== H.IEEE_FLOAT && i !== H.ALAW && i !== H.MULAW) throw Error(`Unsupported WAVE codec (format tag ${i}). Only integer/float PCM, A-law, and μ-law are supported.`);
		if (i === H.PCM && ![
			8,
			16,
			24,
			32
		].includes(c)) throw Error(`Unsupported WAVE PCM bit depth (${c}). Only 8, 16, 24, and 32 bits are supported.`);
		if (i === H.IEEE_FLOAT && ![32, 64].includes(c)) throw Error(`Unsupported WAVE float bit depth (${c}). Only 32 and 64 bits are supported.`);
		this.audioInfo = {
			format: i,
			numberOfChannels: a,
			sampleRate: o,
			sampleSizeInBytes: Math.ceil(c / 8),
			blockSizeInBytes: s
		};
	}
	async parseListChunk(e, t, n) {
		let r = this.reader.requestSlice(e, t);
		if (A(r) && (r = await r), !r) return;
		let i = Q(r, 4);
		if (i !== "INFO" && i !== "INF0") return;
		let a = r.filePos;
		for (; a <= e + t - 8;) {
			r.filePos = a;
			let e = Q(r, 4), t = Qs(r, n), i = q(r, t), o = 0;
			for (let e = 0; e < i.length && i[e] !== 0; e++) o++;
			let s = String.fromCharCode(...i.subarray(0, o));
			switch (this.metadataTags.raw ??= {}, this.metadataTags.raw[e] = s, e) {
				case "INAM":
				case "TITL":
					this.metadataTags.title ??= s;
					break;
				case "TIT3":
					this.metadataTags.description ??= s;
					break;
				case "IART":
					this.metadataTags.artist ??= s;
					break;
				case "IPRD":
					this.metadataTags.album ??= s;
					break;
				case "IPRT":
				case "ITRK":
				case "TRCK":
					{
						let e = s.split("/"), t = Number.parseInt(e[0], 10), n = e[1] && Number.parseInt(e[1], 10);
						Number.isInteger(t) && t > 0 && (this.metadataTags.trackNumber ??= t), n && Number.isInteger(n) && n > 0 && (this.metadataTags.tracksTotal ??= n);
					}
					break;
				case "ICRD":
				case "IDIT":
					{
						let e = new Date(s);
						Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
					}
					break;
				case "YEAR":
					{
						let e = Number.parseInt(s, 10);
						Number.isInteger(e) && e > 0 && (this.metadataTags.date ??= new Date(e, 0, 1));
					}
					break;
				case "IGNR":
				case "GENR":
					this.metadataTags.genre ??= s;
					break;
				case "ICMT":
				case "CMNT":
				case "COMM": this.metadataTags.comment ??= s;
			}
			a += 8 + t + (t & 1);
		}
	}
	async parseId3Chunk(e, t) {
		let n = this.reader.requestSlice(e, t);
		if (A(n) && (n = await n), !n) return;
		let r = pc(n);
		if (r) {
			let i = t - 10;
			r.size = Math.min(r.size, i), r.size > 0 && mc(n.slice(e + 10, r.size), r, this.metadataTags);
		}
	}
	getCodec() {
		if (t(this.audioInfo), this.audioInfo.format === H.MULAW) return "ulaw";
		if (this.audioInfo.format === H.ALAW) return "alaw";
		if (this.audioInfo.format === H.PCM) {
			if (this.audioInfo.sampleSizeInBytes === 1) return "pcm-u8";
			if (this.audioInfo.sampleSizeInBytes === 2) return "pcm-s16";
			if (this.audioInfo.sampleSizeInBytes === 3) return "pcm-s24";
			if (this.audioInfo.sampleSizeInBytes === 4) return "pcm-s32";
		}
		if (this.audioInfo.format === H.IEEE_FLOAT) {
			if (this.audioInfo.sampleSizeInBytes === 4) return "pcm-f32";
			if (this.audioInfo.sampleSizeInBytes === 8) return "pcm-f64";
		}
		t(!1);
	}
	async getMimeType() {
		return "audio/wav";
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
}, Qi = 2048, $i = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getCodec() {
		return this.demuxer.getCodec();
	}
	getInternalCodecId() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.format;
	}
	async getDecoderConfig() {
		let e = this.demuxer.getCodec();
		return e ? (t(this.demuxer.audioInfo), {
			codec: e,
			numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
			sampleRate: this.demuxer.audioInfo.sampleRate
		}) : null;
	}
	getNumberOfChannels() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.numberOfChannels;
	}
	getSampleRate() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	getTimeResolution() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return t(this.demuxer.dataSize !== -1), this.demuxer.dataSize / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getDisposition() {
		return { ...et };
	}
	async getPacketAtIndex(e, n) {
		t(e >= 0), t(this.demuxer.audioInfo);
		let r = e * Qi * this.demuxer.audioInfo.blockSizeInBytes;
		if (r >= this.demuxer.dataSize) return null;
		let i = Math.min(Qi * this.demuxer.audioInfo.blockSizeInBytes, this.demuxer.dataSize - r);
		if (this.demuxer.reader.fileSize === null) {
			let e = this.demuxer.reader.requestSlice(this.demuxer.dataStart + r, i);
			if (A(e) && (e = await e), !e) return null;
		}
		let a;
		if (n.metadataOnly) a = I;
		else {
			let e = this.demuxer.reader.requestSlice(this.demuxer.dataStart + r, i);
			A(e) && (e = await e), t(e), a = q(e, i);
		}
		let o = e * Qi / this.demuxer.audioInfo.sampleRate, s = i / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
		return this.demuxer.lastKnownPacketIndex = Math.max(e, this.demuxer.lastKnownPacketIndex), new L(a, "key", o, s, e, i);
	}
	getFirstPacket(e) {
		return this.getPacketAtIndex(0, e);
	}
	async getPacket(e, n) {
		t(this.demuxer.audioInfo);
		let r = Math.floor(Math.min(e * this.demuxer.audioInfo.sampleRate / Qi, (this.demuxer.dataSize - 1) / (Qi * this.demuxer.audioInfo.blockSizeInBytes)));
		if (r < 0) return null;
		let i = await this.getPacketAtIndex(r, n);
		if (i) return i;
		if (r === 0) return null;
		t(this.demuxer.reader.fileSize === null);
		let a = await this.getPacketAtIndex(this.demuxer.lastKnownPacketIndex, n);
		for (; a;) {
			let e = await this.getNextPacket(a, n);
			if (!e) break;
			a = e;
		}
		return a;
	}
	getNextPacket(e, n) {
		t(this.demuxer.audioInfo);
		let r = Math.round(e.timestamp * this.demuxer.audioInfo.sampleRate / Qi);
		return this.getPacketAtIndex(r + 1, n);
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, ea = (e) => {
	let t = e.filePos, n = new M(q(e, 9));
	if (n.readBits(12) !== 4095 || (n.skipBits(1), n.readBits(2) !== 0)) return null;
	let r = n.readBits(1), i = n.readBits(2) + 1, a = n.readBits(4);
	if (a === 15) return null;
	n.skipBits(1);
	let o = n.readBits(3);
	if (o === 0) throw Error("ADTS frames with channel configuration 0 are not supported.");
	n.skipBits(1), n.skipBits(1), n.skipBits(1), n.skipBits(1);
	let s = n.readBits(13);
	n.skipBits(11);
	let c = n.readBits(2) + 1;
	if (c !== 1) throw Error("ADTS frames with more than one AAC frame are not supported.");
	let l = null;
	return r === 1 ? e.filePos -= 2 : l = n.readBits(16), {
		objectType: i,
		samplingFrequencyIndex: a,
		channelConfiguration: o,
		frameLength: s,
		numberOfAacFrames: c,
		crcCheck: l,
		startPos: t
	};
}, ta = 1024, na = class extends vr {
	constructor(e) {
		super(e), this.metadataPromise = null, this.firstFrameHeader = null, this.loadedSamples = [], this.metadataTags = null, this.trackBackings = [], this.readingMutex = new S(), this.lastSampleLoaded = !1, this.lastLoadedPos = 0, this.nextTimestampInSamples = 0, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			for (; !this.firstFrameHeader && !this.lastSampleLoaded;) await this.advanceReader();
			t(this.firstFrameHeader), this.trackBackings = [new ra(this)];
		})();
	}
	async advanceReader() {
		if (this.lastLoadedPos === 0) for (;;) {
			let e = this.reader.requestSlice(this.lastLoadedPos, 10);
			if (A(e) && (e = await e), !e) {
				this.lastSampleLoaded = !0;
				return;
			}
			let t = pc(e);
			if (!t) break;
			this.lastLoadedPos = e.filePos + t.size;
		}
		let e = this.reader.requestSliceRange(this.lastLoadedPos, 7, 9);
		if (A(e) && (e = await e), !e) {
			this.lastSampleLoaded = !0;
			return;
		}
		let n = ea(e);
		if (!n) {
			this.lastSampleLoaded = !0;
			return;
		}
		if (this.reader.fileSize !== null && n.startPos + n.frameLength > this.reader.fileSize) {
			this.lastSampleLoaded = !0;
			return;
		}
		this.firstFrameHeader ||= n;
		let r = nt[n.samplingFrequencyIndex];
		t(r !== void 0);
		let i = ta / r, a = {
			timestamp: this.nextTimestampInSamples / r,
			duration: i,
			dataStart: n.startPos,
			dataSize: n.frameLength
		};
		this.loadedSamples.push(a), this.nextTimestampInSamples += ta, this.lastLoadedPos = n.startPos + n.frameLength;
	}
	async getMimeType() {
		return "audio/aac";
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackings;
	}
	async getMetadataTags() {
		let e = await this.readingMutex.acquire();
		try {
			if (await this.readMetadata(), this.metadataTags) return this.metadataTags;
			this.metadataTags = {};
			let e = 0;
			for (;;) {
				let t = this.reader.requestSlice(e, 10);
				if (A(t) && (t = await t), !t) break;
				let n = pc(t);
				if (!n) break;
				let r = this.reader.requestSlice(t.filePos, n.size);
				if (A(r) && (r = await r), !r) break;
				mc(r, n, this.metadataTags), e = t.filePos + n.size;
			}
			return this.metadataTags;
		} finally {
			e();
		}
	}
}, ra = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getTimeResolution() {
		return this.getSampleRate() / ta;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getCodec() {
		return "aac";
	}
	getInternalCodecId() {
		return t(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.objectType;
	}
	getNumberOfChannels() {
		t(this.demuxer.firstFrameHeader);
		let e = rt[this.demuxer.firstFrameHeader.channelConfiguration];
		return t(e !== void 0), e;
	}
	getSampleRate() {
		t(this.demuxer.firstFrameHeader);
		let e = nt[this.demuxer.firstFrameHeader.samplingFrequencyIndex];
		return t(e !== void 0), e;
	}
	getDisposition() {
		return { ...et };
	}
	async getDecoderConfig() {
		return t(this.demuxer.firstFrameHeader), {
			codec: `mp4a.40.${this.demuxer.firstFrameHeader.objectType}`,
			numberOfChannels: this.getNumberOfChannels(),
			sampleRate: this.getSampleRate()
		};
	}
	async getPacketAtIndex(e, t) {
		if (e === -1) return null;
		let n = this.demuxer.loadedSamples[e];
		if (!n) return null;
		let r;
		if (t.metadataOnly) r = I;
		else {
			let e = this.demuxer.reader.requestSlice(n.dataStart, n.dataSize);
			if (A(e) && (e = await e), !e) return null;
			r = q(e, n.dataSize);
		}
		return new L(r, "key", n.timestamp, n.duration, e, n.dataSize);
	}
	getFirstPacket(e) {
		return this.getPacketAtIndex(0, e);
	}
	async getNextPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			let n = D(this.demuxer.loadedSamples, e.timestamp, (e) => e.timestamp);
			if (n === -1) throw Error("Packet was not created from this track.");
			let r = n + 1;
			for (; r >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(r, t);
		} finally {
			n();
		}
	}
	async getPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			for (;;) {
				let n = O(this.demuxer.loadedSamples, e, (e) => e.timestamp);
				if (n === -1 && this.demuxer.loadedSamples.length > 0) return null;
				if (this.demuxer.lastSampleLoaded || n >= 0 && n + 1 < this.demuxer.loadedSamples.length) return this.getPacketAtIndex(n, t);
				await this.demuxer.advanceReader();
			}
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
}, ia = (e) => e === 0 ? null : e === 1 ? 192 : e >= 2 && e <= 5 ? 144 * 2 ** e : e === 6 ? "uncommon-u8" : e === 7 ? "uncommon-u16" : e >= 8 && e <= 15 ? 2 ** e : null, aa = (e, t) => {
	switch (e) {
		case 0: return t;
		case 1: return 88200;
		case 2: return 176400;
		case 3: return 192e3;
		case 4: return 8e3;
		case 5: return 16e3;
		case 6: return 22050;
		case 7: return 24e3;
		case 8: return 32e3;
		case 9: return 44100;
		case 10: return 48e3;
		case 11: return 96e3;
		case 12: return "uncommon-u8";
		case 13: return "uncommon-u16";
		case 14: return "uncommon-u16-10";
		default: return null;
	}
}, oa = (e) => {
	let t = 0, n = new M(q(e, 1));
	for (; n.readBits(1) === 1;) t++;
	if (t === 0) return n.readBits(7);
	let r = [], i = t - 1, a = new M(q(e, i)), o = 8 - t - 1;
	for (let e = 0; e < o; e++) r.unshift(n.readBits(1));
	for (let e = 0; e < i; e++) for (let e = 0; e < 8; e++) {
		let t = a.readBits(1);
		e < 2 || r.unshift(t);
	}
	return r.reduce((e, t, n) => e | t << n, 0);
}, sa = (e, n) => {
	if (n === "uncommon-u16") return Y(e) + 1;
	if (n === "uncommon-u8") return J(e) + 1;
	if (typeof n == "number") return n;
	oe(n), t(!1);
}, ca = (e, t) => t === "uncommon-u16" ? Y(e) : t === "uncommon-u16-10" ? Y(e) * 10 : t === "uncommon-u8" ? J(e) : typeof t == "number" ? t : null, la = (e) => {
	let t = 0;
	for (let n of e) {
		t ^= n;
		for (let e = 0; e < 8; e++) t & 128 ? t = t << 1 ^ 7 : t <<= 1, t &= 255;
	}
	return t;
}, ua = class extends vr {
	constructor(e) {
		super(e), this.loadedSamples = [], this.metadataPromise = null, this.trackBacking = null, this.metadataTags = {}, this.audioInfo = null, this.lastLoadedPos = null, this.blockingBit = null, this.readingMutex = new S(), this.lastSampleLoaded = !1, this.reader = e._reader;
	}
	async getMetadataTags() {
		return await this.readMetadata(), this.metadataTags;
	}
	async getTrackBackings() {
		return await this.readMetadata(), t(this.trackBacking), [this.trackBacking];
	}
	async getMimeType() {
		return "audio/flac";
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = 0;
			for (;;) {
				let n = this.reader.requestSlice(e, 10);
				if (A(n) && (n = await n), !n) {
					this.lastSampleLoaded = !0;
					return;
				}
				let r = pc(n);
				if (!r) break;
				let i = this.reader.requestSlice(n.filePos, r.size);
				A(i) && (i = await i), t(i), mc(i, r, this.metadataTags), e = n.filePos + r.size;
			}
			for (e += 4; this.reader.fileSize === null || e < this.reader.fileSize;) {
				let n = this.reader.requestSlice(e, 4);
				if (A(n) && (n = await n), e += 4, n === null) throw Error(`Metadata block at position ${e} is too small! Corrupted file.`);
				t(n);
				let r = J(n), i = Xs(n), a = !!(r & 128);
				switch (r & 127) {
					case $t.STREAMINFO: {
						let n = this.reader.requestSlice(e, i);
						if (A(n) && (n = await n), t(n), n === null) throw Error(`StreamInfo block at position ${e} is too small! Corrupted file.`);
						let r = q(n, 34), a = new M(r), o = a.readBits(16), s = a.readBits(16), c = a.readBits(24), l = a.readBits(24), u = a.readBits(20), d = a.readBits(3) + 1;
						a.readBits(5);
						let f = a.readBits(36);
						a.skipBits(128);
						let p = /* @__PURE__ */ new Uint8Array(42);
						p.set(new Uint8Array([
							102,
							76,
							97,
							67
						]), 0), p.set(new Uint8Array([
							128,
							0,
							0,
							34
						]), 4), p.set(r, 8), this.audioInfo = {
							numberOfChannels: d,
							sampleRate: u,
							totalSamples: f,
							minimumBlockSize: o,
							maximumBlockSize: s,
							minimumFrameSize: c,
							maximumFrameSize: l,
							description: p
						}, this.trackBacking = new da(this);
						break;
					}
					case $t.VORBIS_COMMENT: {
						let n = this.reader.requestSlice(e, i);
						A(n) && (n = await n), t(n), en(q(n, i), this.metadataTags);
						break;
					}
					case $t.PICTURE: {
						let n = this.reader.requestSlice(e, i);
						A(n) && (n = await n), t(n);
						let r = X(n), a = X(n), o = l.decode(q(n, a)), s = X(n), c = l.decode(q(n, s));
						n.skip(16);
						let u = X(n), d = q(n, u);
						this.metadataTags.images ??= [], this.metadataTags.images.push({
							data: d,
							mimeType: o,
							kind: r === 3 ? "coverFront" : r === 4 ? "coverBack" : "unknown",
							description: c
						});
						break;
					}
				}
				if (e += i, a) {
					this.lastLoadedPos = e;
					break;
				}
			}
			if (!this.audioInfo) throw Error("Missing STREAMINFO metadata block! Corrupted FLAC file.");
		})();
	}
	async readNextFlacFrame({ startPos: e, isFirstPacket: n }) {
		t(this.audioInfo);
		let r = this.audioInfo.maximumBlockSize * this.audioInfo.numberOfChannels * 4 + 16 + 2, i = this.audioInfo.minimumFrameSize || 10, a = (this.audioInfo.maximumFrameSize || r) + 16, o = await this.reader.requestSliceRange(e, 16, a);
		if (!o) return null;
		let s = this.readFlacFrameHeader({
			slice: o,
			isFirstPacket: n
		});
		if (!s) return null;
		for (o.filePos = e + i;;) {
			if (o.filePos > o.end - 6) return {
				num: s.num,
				blockSize: s.blockSize,
				sampleRate: s.sampleRate,
				size: o.end - e,
				isLastFrame: !0
			};
			if (J(o) === 255) {
				let t = o.filePos;
				if (J(o) !== (this.blockingBit === 1 ? 249 : 248)) {
					o.filePos = t;
					continue;
				}
				o.skip(-2);
				let n = o.filePos - e, r = this.readFlacFrameHeader({
					slice: o,
					isFirstPacket: !1
				});
				if (!r) {
					o.filePos = t;
					continue;
				}
				if (this.blockingBit === 0) {
					if (r.num - s.num !== 1) {
						o.filePos = t;
						continue;
					}
				} else if (r.num - s.num !== s.blockSize) {
					o.filePos = t;
					continue;
				}
				return {
					num: s.num,
					blockSize: s.blockSize,
					sampleRate: s.sampleRate,
					size: n,
					isLastFrame: !1
				};
			}
		}
	}
	readFlacFrameHeader({ slice: e, isFirstPacket: n }) {
		let r = e.filePos, i = new M(q(e, 4));
		if (i.readBits(15) !== 32764) return null;
		if (this.blockingBit === null) {
			t(n);
			let e = i.readBits(1);
			this.blockingBit = e;
		} else if (this.blockingBit === 1) {
			if (t(!n), i.readBits(1) !== 1) return null;
		} else if (this.blockingBit === 0) {
			if (t(!n), i.readBits(1) !== 0) return null;
		} else throw Error("Invalid blocking bit");
		let a = ia(i.readBits(4));
		if (!a) return null;
		t(this.audioInfo);
		let o = aa(i.readBits(4), this.audioInfo.sampleRate);
		if (!o || (i.readBits(4), i.readBits(3), i.readBits(1) !== 0)) return null;
		let s = oa(e), c = sa(e, a), l = ca(e, o);
		if (l === null || l !== this.audioInfo.sampleRate) return null;
		let u = e.filePos - r, d = J(e);
		return e.skip(-u), e.skip(-1), d === la(q(e, u)) ? {
			num: s,
			blockSize: c,
			sampleRate: l
		} : null;
	}
	async advanceReader() {
		await this.readMetadata(), t(this.lastLoadedPos !== null), t(this.audioInfo);
		let e = this.lastLoadedPos, n = await this.readNextFlacFrame({
			startPos: e,
			isFirstPacket: this.loadedSamples.length === 0
		});
		if (!n) {
			this.lastSampleLoaded = !0;
			return;
		}
		let r = this.loadedSamples[this.loadedSamples.length - 1], i = {
			blockOffset: r ? r.blockOffset + r.blockSize : 0,
			blockSize: n.blockSize,
			byteOffset: e,
			byteSize: n.size
		};
		if (this.lastLoadedPos += n.size, this.loadedSamples.push(i), n.isLastFrame) {
			this.lastSampleLoaded = !0;
			return;
		}
	}
}, da = class {
	constructor(e) {
		this.demuxer = e;
	}
	getType() {
		return "audio";
	}
	getId() {
		return 1;
	}
	getNumber() {
		return 1;
	}
	getCodec() {
		return "flac";
	}
	getInternalCodecId() {
		return null;
	}
	getNumberOfChannels() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.numberOfChannels;
	}
	getSampleRate() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getTimeResolution() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return t(this.demuxer.audioInfo), this.demuxer.audioInfo.totalSamples === 0 ? null : this.demuxer.audioInfo.totalSamples / this.demuxer.audioInfo.sampleRate;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	getDisposition() {
		return { ...et };
	}
	async getDecoderConfig() {
		return t(this.demuxer.audioInfo), {
			codec: "flac",
			numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
			sampleRate: this.demuxer.audioInfo.sampleRate,
			description: this.demuxer.audioInfo.description
		};
	}
	async getPacket(e, n) {
		if (t(this.demuxer.audioInfo), e < 0) return null;
		let r = await this.demuxer.readingMutex.acquire();
		try {
			for (;;) {
				let t = O(this.demuxer.loadedSamples, e, (e) => e.blockOffset / this.demuxer.audioInfo.sampleRate);
				if (t === -1) {
					await this.demuxer.advanceReader();
					continue;
				}
				let r = this.demuxer.loadedSamples[t];
				if (r.blockOffset / this.demuxer.audioInfo.sampleRate + r.blockSize / this.demuxer.audioInfo.sampleRate <= e) {
					if (this.demuxer.lastSampleLoaded) return this.getPacketAtIndex(this.demuxer.loadedSamples.length - 1, n);
					await this.demuxer.advanceReader();
					continue;
				}
				return this.getPacketAtIndex(t, n);
			}
		} finally {
			r();
		}
	}
	async getNextPacket(e, t) {
		let n = await this.demuxer.readingMutex.acquire();
		try {
			let n = e.sequenceNumber + 1;
			if (this.demuxer.lastSampleLoaded && n >= this.demuxer.loadedSamples.length) return null;
			for (; n >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(n, t);
		} finally {
			n();
		}
	}
	getKeyPacket(e, t) {
		return this.getPacket(e, t);
	}
	getNextKeyPacket(e, t) {
		return this.getNextPacket(e, t);
	}
	async getPacketAtIndex(e, n) {
		let r = this.demuxer.loadedSamples[e];
		if (!r) return null;
		let i;
		if (n.metadataOnly) i = I;
		else {
			let e = this.demuxer.reader.requestSlice(r.byteOffset, r.byteSize);
			if (A(e) && (e = await e), !e) return null;
			i = q(e, r.byteSize);
		}
		t(this.demuxer.audioInfo);
		let a = r.blockOffset / this.demuxer.audioInfo.sampleRate, o = r.blockSize / this.demuxer.audioInfo.sampleRate;
		return new L(i, "key", a, o, e, r.byteSize);
	}
	async getFirstPacket(e) {
		for (; this.demuxer.loadedSamples.length === 0 && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
		return this.getPacketAtIndex(0, e);
	}
}, fa = 9e4, pa = (e) => {
	let t = "video/MP2T", n = [...new Set(e.filter(Boolean))];
	return n.length > 0 && (t += `; codecs="${n.join(", ")}"`), t;
}, ma = "PES packet is missing PTS where it was expected. PES packets without PTS are not currently supported. If you think this file should be supported, please report it.", ha = 5, ga = 1212435798, _a = 1212436562, va = 1146376960, ya = /* @__PURE__ */ new Set([
	133,
	134,
	162
]), ba = /* @__PURE__ */ new Set(), xa = class extends vr {
	constructor(e) {
		super(e), this.metadataPromise = null, this.elementaryStreams = [], this.trackBackingEntries = [], this.packetOffset = 0, this.packetStride = -1, this.sectionEndPositions = [], this.seekChunkSize = 5242880, this.minReferencePointByteDistance = -1, this.reader = e._reader;
	}
	async readMetadata() {
		return this.metadataPromise ??= (async () => {
			let e = this.reader.requestSlice(0, 205);
			A(e) && (e = await e), t(e);
			let n = q(e, 205);
			if (n[0] === 71 && n[188] === 71) this.packetOffset = 0, this.packetStride = 188;
			else if (n[0] === 71 && n[204] === 71) this.packetOffset = 0, this.packetStride = 204;
			else if (n[4] === 71 && n[196] === 71) this.packetOffset = 4, this.packetStride = 192;
			else throw Error("Unreachable.");
			this.minReferencePointByteDistance = 256 * this.packetStride;
			let r = this.packetOffset, i = null, a = !1, o = !1;
			for (;;) {
				let e = await this.readPacketHeader(r);
				if (!e) break;
				if (e.payloadUnitStartIndicator === 0) {
					r += this.packetStride;
					continue;
				}
				if (o && !this.elementaryStreams.some((t) => t.pid === e.pid)) {
					r += this.packetStride;
					continue;
				}
				let n = await this.readSection(r, !0, !o);
				if (!n) break;
				let s = !1;
				if (!o && n.pid !== 0 && (n.payload[0] !== 0 || n.payload[1] !== 0 || n.payload[2] !== 1)) {
					let e = new M(n.payload), t = e.readAlignedByte();
					e.skipBits(8 * t), s = e.readBits(8) === 2;
				}
				if (n.pid === 0 && !a) {
					let e = new M(n.payload), t = e.readAlignedByte();
					e.skipBits(8 * t), e.skipBits(14);
					let r = e.readBits(10);
					for (e.skipBits(40); 8 * (r + 3) - e.pos > 32;) {
						let t = e.readBits(16);
						e.skipBits(3);
						let n = e.readBits(13);
						if (t !== 0) {
							if (i !== null) throw Error("Only files with a single program are supported.");
							i = n;
						}
					}
					if (i === null) throw Error("Program Association Table must link to a Program Map Table.");
					a = !0;
				} else if ((n.pid === i || s) && !o) {
					let e = new M(n.payload), t = e.readAlignedByte();
					e.skipBits(8 * t), e.skipBits(12);
					let r = e.readBits(12);
					e.skipBits(43), e.readBits(13), e.skipBits(6);
					let i = e.readBits(10), a = e.pos + 8 * i, s = !1;
					for (; e.pos < a;) {
						let t = e.readBits(8), n = e.readBits(8), r = e.pos + 8 * n;
						if (t === ha && n >= 4) {
							let t = e.readBits(32);
							s ||= t === ga || t === _a;
						}
						e.pos = r;
					}
					for (e.pos = a; 8 * (r + 3) - e.pos > 32;) {
						let t = e.readBits(8);
						e.skipBits(3);
						let n = e.readBits(13);
						e.skipBits(6);
						let r = e.readBits(10), i = e.pos + 8 * r, a = !1, o = !1, c = !1;
						for (; e.pos < i;) {
							let t = e.readBits(8), n = e.readBits(8), r = e.pos + 8 * n;
							if (t === 106) a = !0;
							else if (t === 122 || t === 204) o = !0;
							else if (t === 123) c = !0;
							else if (t === ha && n >= 4) {
								let t = e.readBits(32);
								c ||= (t & 4294967040) === va;
							}
							e.pos = r;
						}
						let l = null, u = s && ya.has(t) ? 130 : t;
						switch (u) {
							case 27:
							case 36:
								l = {
									type: "video",
									codec: t === 27 ? "avc" : "hevc",
									decoderConfig: null,
									avcCodecInfo: null,
									hevcCodecInfo: null,
									colorSpace: {
										primaries: null,
										transfer: null,
										matrix: null,
										fullRange: null
									},
									width: -1,
									height: -1,
									squarePixelWidth: -1,
									squarePixelHeight: -1,
									reorderSize: -1
								};
								break;
							case 3:
							case 4:
							case 15:
							case 129:
							case 135:
							case 130:
							case 138:
								{
									let e;
									e = u === 3 || u === 4 ? "mp3" : u === 15 ? "aac" : u === 129 ? "ac3" : u === 135 ? "eac3" : "dts", l = {
										type: "audio",
										codec: e,
										decoderConfig: null,
										aacCodecInfo: null,
										dtsFormat: null,
										numberOfChannels: -1,
										sampleRate: -1
									};
								}
								break;
							case 6:
								o ? l = {
									type: "audio",
									codec: "eac3",
									decoderConfig: null,
									aacCodecInfo: null,
									dtsFormat: null,
									numberOfChannels: -1,
									sampleRate: -1
								} : a ? l = {
									type: "audio",
									codec: "ac3",
									decoderConfig: null,
									aacCodecInfo: null,
									dtsFormat: null,
									numberOfChannels: -1,
									sampleRate: -1
								} : c && (l = {
									type: "audio",
									codec: "dts",
									decoderConfig: null,
									aacCodecInfo: null,
									dtsFormat: null,
									numberOfChannels: -1,
									sampleRate: -1
								});
								break;
							default: ba.has(t) || (j._warn(`Note: MPEG-TS streams with stream_type 0x${t.toString(16)} are not currently supported.`), ba.add(t));
						}
						l && this.elementaryStreams.push({
							demuxer: this,
							pid: n,
							streamType: t,
							initialized: !1,
							firstSection: null,
							canBeTrustedWithKeyPackets: !1,
							info: l,
							referencePesPackets: []
						});
					}
					o = !0;
				} else {
					let e = this.elementaryStreams.find((e) => e.pid === n.pid);
					outer: if (e && !e.initialized) {
						let r = Ca(n, !0);
						if (!r) throw Error(`Couldn't read first PES packet for Elementary Stream with PID ${e.pid}`);
						if (e.firstSection = n, e.canBeTrustedWithKeyPackets = n.randomAccessIndicator === 1, this.input._initInput) {
							let t = (await this.input._initInput._getDemuxer()).elementaryStreams.find((t) => t.pid === n.pid && t.info.codec === e.info.codec);
							if (t) {
								e.info = t.info, e.initialized = !0;
								break outer;
							}
						}
						let i = new Oa(e, r);
						if (e.info.type === "video") {
							for (;;) {
								let n = i;
								if (n.suppliedPacket = null, await i.markNextPacket(), e.info.codec === "avc") {
									if (!i.suppliedPacket) throw Error("Invalid AVC video stream; could not extract AVCDecoderConfigurationRecord from any packet.");
									if (e.info.avcCodecInfo = St(i.suppliedPacket.data), !e.info.avcCodecInfo) continue;
									let n = e.info.avcCodecInfo.sequenceParameterSets[0];
									t(n);
									let r = Tt(n);
									e.info.width = r.displayWidth, e.info.height = r.displayHeight;
									let a = r.pixelAspectRatio.num, o = r.pixelAspectRatio.den;
									a > 0 && o > 0 && (a > o ? (e.info.squarePixelWidth = Math.round(e.info.width * a / o), e.info.squarePixelHeight = e.info.height) : (e.info.squarePixelWidth = e.info.width, e.info.squarePixelHeight = Math.round(e.info.height * o / a))), e.info.colorSpace = {
										primaries: p[r.colourPrimaries],
										transfer: h[r.transferCharacteristics],
										matrix: _[r.matrixCoefficients],
										fullRange: !!r.fullRangeFlag
									}, e.info.reorderSize = r.maxDecFrameBuffering;
									break;
								}
								if (e.info.codec === "hevc") {
									if (!i.suppliedPacket) throw Error("Invalid HEVC video stream; could not extract HVCDecoderConfigurationRecord from first packet.");
									if (e.info.hevcCodecInfo = jt(i.suppliedPacket.data), !e.info.hevcCodecInfo) continue;
									let n = e.info.hevcCodecInfo.arrays.find((e) => e.nalUnitType === P.SPS_NUT).nalUnits[0];
									t(n);
									let r = At(n);
									e.info.width = r.displayWidth, e.info.height = r.displayHeight, r.pixelAspectRatio.num > r.pixelAspectRatio.den ? (e.info.squarePixelWidth = Math.round(e.info.width * r.pixelAspectRatio.num / r.pixelAspectRatio.den), e.info.squarePixelHeight = e.info.height) : (e.info.squarePixelWidth = e.info.width, e.info.squarePixelHeight = Math.round(e.info.height * r.pixelAspectRatio.den / r.pixelAspectRatio.num)), e.info.colorSpace = {
										primaries: p[r.colourPrimaries],
										transfer: h[r.transferCharacteristics],
										matrix: _[r.matrixCoefficients],
										fullRange: !!r.fullRangeFlag
									}, e.info.reorderSize = r.maxDecFrameBuffering;
									break;
								}
								throw Error("Unhandled.");
							}
							e.info.decoderConfig = {
								codec: Kn({
									width: e.info.width,
									height: e.info.height,
									codec: e.info.codec,
									codecDescription: null,
									colorSpace: e.info.colorSpace,
									avcType: 1,
									avcCodecInfo: e.info.avcCodecInfo,
									hevcCodecInfo: e.info.hevcCodecInfo,
									vp9CodecInfo: null,
									av1CodecInfo: null,
									proresFormat: null
								}),
								codedWidth: e.info.width,
								codedHeight: e.info.height,
								colorSpace: e.info.colorSpace
							}, (e.info.width !== e.info.squarePixelWidth || e.info.height !== e.info.squarePixelHeight) && (e.info.decoderConfig.displayAspectWidth = e.info.squarePixelWidth, e.info.decoderConfig.displayAspectHeight = e.info.squarePixelHeight), e.initialized = !0;
						} else {
							if (await i.markNextPacket(), !i.suppliedPacket) throw Error(`Couldn't parse first media packet for Elementary Stream with PID ${e.pid}`);
							if (e.info.codec === "aac") {
								let t = ea(Js.tempFromBytes(i.suppliedPacket.data));
								if (!t) throw Error("Invalid AAC audio stream; could not read ADTS frame header from first packet.");
								e.info.aacCodecInfo = {
									isMpeg2: !1,
									objectType: t.objectType
								}, e.info.numberOfChannels = rt[t.channelConfiguration], e.info.sampleRate = nt[t.samplingFrequencyIndex];
							} else if (e.info.codec === "mp3") {
								let t = mr(X(Js.tempFromBytes(i.suppliedPacket.data)), i.suppliedPacket.data.byteLength);
								if (!t.header) throw Error("Invalid MP3 audio stream; could not read frame header from first packet.");
								e.info.numberOfChannels = _r(t.header.channel), e.info.sampleRate = t.header.sampleRate;
							} else if (e.info.codec === "ac3") {
								let t = nn(i.suppliedPacket.data);
								if (!t) throw Error("Invalid AC-3 audio stream; could not read sync frame from first packet.");
								if (t.fscod === 3) throw Error("Invalid AC-3 audio stream; reserved sample rate code found in first packet.");
								e.info.numberOfChannels = tn[t.acmod] + t.lfeon, e.info.sampleRate = dt[t.fscod];
							} else if (e.info.codec === "eac3") {
								let t = sn(i.suppliedPacket.data);
								if (!t) throw Error("Invalid E-AC-3 audio stream; could not read sync frame from first packet.");
								let n = ln(t);
								if (n === null) throw Error("Invalid E-AC-3 audio stream; reserved sample rate code found in first packet.");
								e.info.numberOfChannels = un(t), e.info.sampleRate = n;
							} else if (e.info.codec === "dts") {
								let t = Cn(i.suppliedPacket.data);
								if (!t) throw Error("Invalid DTS audio stream; could not read frame header from first packet.");
								e.info.numberOfChannels = t.numberOfChannels, e.info.sampleRate = t.sampleRate, t.core && (e.info.dtsFormat = t.hasExtensions ? "dtsh" : "dtsc");
							} else throw Error("Unhandled.");
							e.info.decoderConfig = {
								codec: Jn({
									codec: e.info.codec,
									codecDescription: null,
									aacCodecInfo: e.info.aacCodecInfo,
									dtsFormat: e.info.dtsFormat
								}),
								numberOfChannels: e.info.numberOfChannels,
								sampleRate: e.info.sampleRate
							}, e.initialized = !0;
						}
					}
				}
				if (o && this.elementaryStreams.every((e) => e.initialized)) break;
				r += this.packetStride;
			}
			if (!o) throw Error(a ? "No Program Map Table found in the file." : "No Program Association Table found in the file.");
			for (let e of this.elementaryStreams) e.initialized && (e.info.type === "video" ? this.trackBackingEntries.push(new Ta(e)) : this.trackBackingEntries.push(new Ea(e)));
		})();
	}
	async getTrackBackings() {
		return await this.readMetadata(), this.trackBackingEntries;
	}
	async getMetadataTags() {
		return {};
	}
	async getMimeType() {
		return await this.readMetadata(), pa(await Promise.all(this.trackBackingEntries.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null))));
	}
	async readSection(e, t, n = !1) {
		let r = e, i = e, a = [], o = 0, s = null, c = !0, l = 0;
		for (;;) {
			let e = await this.readPacket(i);
			if (i += this.packetStride, !e) break;
			if (s) {
				if (e.pid !== s.pid) {
					if (n) break;
					continue;
				}
				if (e.payloadUnitStartIndicator === 1) break;
			} else {
				if (e.payloadUnitStartIndicator === 0) break;
				s = e;
			}
			let u = !!(e.adaptationFieldControl & 2), d = !!(e.adaptationFieldControl & 1), f = 0;
			if (u && (f = 1 + e.body[0], e === s && f > 1 && (l = e.body[1] >> 6 & 1)), d && (f === 0 ? (a.push(e.body), o += e.body.byteLength) : (a.push(e.body.subarray(f)), o += e.body.byteLength - f)), r = i, !t && o >= 64) {
				c = !1;
				break;
			}
			if (D(this.sectionEndPositions, r, (e) => e) !== -1) {
				c = !1;
				break;
			}
		}
		if (c) {
			let e = O(this.sectionEndPositions, r, (e) => e);
			this.sectionEndPositions.splice(e + 1, 0, r);
		}
		if (!s) return null;
		let u;
		if (a.length === 1) u = a[0];
		else {
			let e = a.reduce((e, t) => e + t.length, 0);
			u = new Uint8Array(e);
			let t = 0;
			for (let e of a) u.set(e, t), t += e.length;
		}
		return {
			startPos: e,
			endPos: t ? r : null,
			pid: s.pid,
			payload: u,
			randomAccessIndicator: l
		};
	}
	async readPacketHeader(e) {
		let t = this.reader.requestSlice(e, 4);
		if (A(t) && (t = await t), !t) return null;
		if (J(t) !== 71) throw Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
		let n = Y(t);
		n >> 15;
		let r = n >> 14 & 1;
		n >> 13 & 1;
		let i = n & 8191, a = J(t);
		a >> 6;
		let o = a >> 4 & 3;
		return a & 15, {
			payloadUnitStartIndicator: r,
			pid: i,
			adaptationFieldControl: o
		};
	}
	async readPacket(e) {
		let t = this.reader.requestSlice(e, 188);
		if (A(t) && (t = await t), !t) return null;
		let n = q(t, 188);
		if (n[0] !== 71) throw Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
		let r = (n[1] << 8) + n[2];
		r >> 15;
		let i = r >> 14 & 1;
		r >> 13 & 1;
		let a = r & 8191, o = n[3];
		o >> 6;
		let s = o >> 4 & 3;
		return o & 15, {
			payloadUnitStartIndicator: i,
			pid: a,
			adaptationFieldControl: s,
			body: n.subarray(4)
		};
	}
}, Sa = (e, t) => {
	if (e.payload.byteLength < 3) return null;
	let n = new M(e.payload);
	if (n.readBits(24) !== 1) return null;
	let r = n.readBits(8);
	if (n.skipBits(16), r === 188 || r === 190 || r === 191 || r === 240 || r === 241 || r === 255 || r === 242 || r === 248) return null;
	n.skipBits(8);
	let i = n.readBits(2);
	n.skipBits(14);
	let a = null;
	if (i === 2 || i === 3) a = 0, n.skipBits(4), a += n.readBits(3) * (1 << 30), n.skipBits(1), a += n.readBits(15) * 32768, n.skipBits(1), a += n.readBits(15);
	else if (t) throw Error(ma);
	return {
		sectionStartPos: e.startPos,
		sectionEndPos: e.endPos,
		pts: a,
		randomAccessIndicator: e.randomAccessIndicator
	};
}, Ca = (e, n) => {
	t(e.endPos !== null);
	let r = Sa(e, n);
	if (!r) return null;
	let i = new M(e.payload);
	i.skipBits(32);
	let a = i.readBits(16);
	i.skipBits(16);
	let o = i.readBits(8), s = i.pos + 8 * o;
	i.pos = s;
	let c = s / 8;
	t(Number.isInteger(c));
	let l = e.payload.subarray(c, a > 0 ? 6 + a : e.payload.byteLength);
	return {
		...r,
		data: l
	};
}, wa = class e {
	constructor(e) {
		this.elementaryStream = e, this.packetBuffers = /* @__PURE__ */ new WeakMap(), this.packetSectionStarts = /* @__PURE__ */ new WeakMap();
	}
	getId() {
		return this.elementaryStream.pid;
	}
	getNumber() {
		let n = this.elementaryStream.demuxer, r = this.elementaryStream.info.type, i = 0;
		for (let a of n.trackBackingEntries) if (a.getType() === r && i++, t(a instanceof e), a.elementaryStream === this.elementaryStream) break;
		return i;
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getInternalCodecId() {
		return this.elementaryStream.streamType;
	}
	getName() {
		return null;
	}
	getLanguageCode() {
		return "und";
	}
	getDisposition() {
		return {
			...et,
			primary: !1
		};
	}
	getTimeResolution() {
		return fa;
	}
	isRelativeToUnixEpoch() {
		return !1;
	}
	getUnixTimeForTimestamp() {
		return null;
	}
	getPairingMask() {
		return 1n;
	}
	getBitrate() {
		return null;
	}
	getAverageBitrate() {
		return null;
	}
	async getDurationFromMetadata() {
		return null;
	}
	async getLiveRefreshInterval() {
		return null;
	}
	createEncodedPacket(e, t, n) {
		let r;
		return r = this.allPacketsAreKeyPackets() || e.randomAccessIndicator === 1 ? "key" : "delta", new L(n.metadataOnly ? I : e.data, r, e.pts / fa, Math.max(t / fa, 0), e.sequenceNumber, e.data.byteLength);
	}
	async getFirstPacket(e) {
		let n = this.elementaryStream.firstSection;
		t(n);
		let r = Ca(n, !0);
		t(r);
		let i = new Oa(this.elementaryStream, r), a = new ka(this, i), o = await a.readNext();
		if (!o) return null;
		let s = this.createEncodedPacket(o.packet, o.duration, e);
		return this.packetBuffers.set(s, a), this.packetSectionStarts.set(s, o.packet.sectionStartPos), s;
	}
	async getNextPacket(e, n) {
		let r = this.packetBuffers.get(e);
		if (r) {
			let t = await r.readNext();
			if (!t) return null;
			this.packetBuffers.delete(e);
			let i = this.createEncodedPacket(t.packet, t.duration, n);
			return this.packetBuffers.set(i, r), this.packetSectionStarts.set(i, t.packet.sectionStartPos), i;
		}
		let i = this.packetSectionStarts.get(e);
		if (i === void 0) throw Error("Packet was not created from this track.");
		let a = await this.elementaryStream.demuxer.readSection(i, !0);
		t(a);
		let o = Ca(a, !0);
		t(o);
		let s = new Oa(this.elementaryStream, o);
		r = new ka(this, s);
		let c = e.sequenceNumber;
		for (;;) {
			let e = await r.readNext();
			if (!e) return null;
			if (e.packet.sequenceNumber > c) {
				let t = this.createEncodedPacket(e.packet, e.duration, n);
				return this.packetBuffers.set(t, r), this.packetSectionStarts.set(t, e.packet.sectionStartPos), t;
			}
		}
	}
	async getNextKeyPacket(e, t) {
		let n = e;
		for (;;) {
			if (n = await this.getNextPacket(n, t), !n) return null;
			if (n.type === "key") return n;
		}
	}
	getPacket(e, t) {
		return this.doPacketLookup(e, !1, t);
	}
	getKeyPacket(e, t) {
		return this.doPacketLookup(e, !0, t);
	}
	async doPacketLookup(e, n, i) {
		let a = de(e * fa), o = this.elementaryStream.demuxer, { reader: s, seekChunkSize: c } = o, l = this.elementaryStream.pid, u = async (e, t, n) => {
			let r = e;
			for (; r < t;) {
				let e = await o.readPacketHeader(r);
				if (!e) return null;
				if (e.pid === l && e.payloadUnitStartIndicator === 1) {
					let e = await o.readSection(r, n);
					if (!e) return null;
					let t = Sa(e, !1);
					if (t && t.pts !== null) return {
						pesPacketHeader: t,
						section: e
					};
				}
				r += o.packetStride;
			}
			return null;
		}, d = this.elementaryStream.firstSection;
		t(d);
		let f = Sa(d, !0);
		if (t(f), a < f.pts) return null;
		let p, m = this.elementaryStream.referencePesPackets, h = O(m, a, (e) => e.pts), g = h === -1 ? null : m[h];
		if (g && a - g.pts < 45e3) p = g.sectionStartPos;
		else {
			let e = 0;
			if (s.fileSize !== null) {
				let t = Math.ceil(s.fileSize / c);
				if (t > 1) {
					let n = 0, r = t - 1;
					for (e = n; n <= r;) {
						let t = Math.floor((n + r) / 2), i = me(t * c, o.packetStride) + f.sectionStartPos, s = await u(i, i + c, !1);
						if (!s) {
							r = t - 1;
							continue;
						}
						s.pesPacketHeader.pts <= a ? (e = t, n = t + 1) : r = t - 1;
					}
				}
			}
			p = me(e * c, o.packetStride) + f.sectionStartPos;
		}
		let _ = (await u(p, s.fileSize ?? Infinity, !1))?.pesPacketHeader ?? null;
		_ ||= f;
		let v = this.getReorderSize(), y = async (e, n) => {
			let s = await o.readSection(e, !0);
			t(s);
			let c = Ca(s, !0);
			t(c);
			let l = new Oa(this.elementaryStream, c), u = new ka(this, l);
			for (; !((r(u.presentationOrderPackets)?.pts ?? -Infinity) >= a || !await u.readNextPacket()););
			let d = re(u.presentationOrderPackets, n);
			if (d === -1) return null;
			let f = u.presentationOrderPackets[d], p = d === 0 ? 0 : f.pts - u.presentationOrderPackets[d - 1].pts;
			for (; u.decodeOrderPackets[0] !== f;) u.decodeOrderPackets.shift();
			u.lastDuration = p;
			let m = await u.readNext();
			t(m);
			let h = this.createEncodedPacket(m.packet, m.duration, i);
			return this.packetBuffers.set(h, u), this.packetSectionStarts.set(h, m.packet.sectionStartPos), h;
		};
		if (!n || this.allPacketsAreKeyPackets()) {
			outer: for (;;) {
				let e = _.sectionStartPos + o.packetStride;
				for (;;) {
					let t = await o.readPacketHeader(e);
					if (!t) break outer;
					if (t.pid === l && t.payloadUnitStartIndicator === 1) {
						let t = await o.readSection(e, !1);
						if (t) {
							let e = Sa(t, !1);
							if (e && e.pts !== null) {
								if (e.pts > a) break outer;
								_ = e, Da(this.elementaryStream, _);
								break;
							}
						}
					}
					e += o.packetStride;
				}
			}
			outer: for (let e = 0; e < v + 1; e++) {
				let e = _.sectionStartPos - o.packetStride;
				for (; e >= o.packetOffset;) {
					let t = await o.readPacketHeader(e);
					if (!t) break outer;
					if (t.pid === l && t.payloadUnitStartIndicator === 1) {
						let t = await o.readSection(e, !1);
						if (t) {
							let e = Sa(t, !1);
							if (e && e.pts !== null) {
								_ = e;
								break;
							}
						}
					}
					e -= o.packetStride;
				}
			}
			return y(_.sectionStartPos, (e) => e.pts <= a);
		}
		{
			let e = p, n = null, r = !this.elementaryStream.canBeTrustedWithKeyPackets;
			for (;;) {
				let i = null, p = e <= f.sectionStartPos, m, h = null;
				if (p) m = f, h = d;
				else {
					let t = await u(e, s.fileSize ?? Infinity, r);
					m = t?.pesPacketHeader ?? null, h = t?.section ?? null;
				}
				let g = !1, _ = 0;
				outer: for (; m && !(n !== null && m.sectionStartPos >= n);) {
					if (m.pts <= a) {
						let e;
						if (this.elementaryStream.canBeTrustedWithKeyPackets) e = m.randomAccessIndicator === 1;
						else {
							t(h);
							let n = Ca(h, !0);
							t(n);
							let r = new Oa(this.elementaryStream, n);
							await r.markNextPacket(), e = r.suppliedPacket?.randomAccessIndicator === 1;
						}
						e && (i = m);
					}
					if (m.pts > a && (g = !0), g && (_++, _ > v)) break;
					let e = m.sectionStartPos + o.packetStride;
					for (;;) {
						let t = await o.readPacketHeader(e);
						if (!t) break outer;
						if (t.pid === l && t.payloadUnitStartIndicator === 1) {
							let t = await o.readSection(e, r);
							if (t) {
								let e = Sa(t, !1);
								if (e && e.pts !== null) {
									m = e, h = t, Da(this.elementaryStream, m);
									break;
								}
							}
						}
						e += o.packetStride;
					}
				}
				if (i) {
					let e = i;
					if (_ === 0) outer: for (let t = 0; t < v; t++) {
						let t = e.sectionStartPos - o.packetStride;
						for (; t >= o.packetOffset;) {
							let n = await o.readPacketHeader(t);
							if (!n) break outer;
							if (n.pid === l && n.payloadUnitStartIndicator === 1) {
								let n = await o.readSection(t, r);
								if (n) {
									let t = Sa(n, !1);
									if (t && t.pts !== null) {
										e = t;
										break;
									}
								}
							}
							t -= o.packetStride;
						}
					}
					let n = await y(e.sectionStartPos, (e) => e.pts <= a && e.randomAccessIndicator === 1);
					return t(n), n;
				}
				if (p) return null;
				n = e, e = Math.max(me(e - f.sectionStartPos - c, o.packetStride) + f.sectionStartPos, f.sectionStartPos);
			}
		}
	}
}, Ta = class extends wa {
	getType() {
		return "video";
	}
	getCodec() {
		return this.elementaryStream.info.codec;
	}
	getCodedWidth() {
		return this.elementaryStream.info.width;
	}
	getCodedHeight() {
		return this.elementaryStream.info.height;
	}
	getSquarePixelWidth() {
		return this.elementaryStream.info.squarePixelWidth;
	}
	getSquarePixelHeight() {
		return this.elementaryStream.info.squarePixelHeight;
	}
	getRotation() {
		return 0;
	}
	async getColorSpace() {
		return this.elementaryStream.info.colorSpace;
	}
	async canBeTransparent() {
		return !1;
	}
	async getDecoderConfig() {
		return t(this.elementaryStream.info.decoderConfig), this.elementaryStream.info.decoderConfig;
	}
	allPacketsAreKeyPackets() {
		return !1;
	}
	getReorderSize() {
		return this.elementaryStream.info.reorderSize;
	}
}, Ea = class extends wa {
	getType() {
		return "audio";
	}
	getCodec() {
		return this.elementaryStream.info.codec;
	}
	getNumberOfChannels() {
		return this.elementaryStream.info.numberOfChannels;
	}
	getSampleRate() {
		return this.elementaryStream.info.sampleRate;
	}
	async getDecoderConfig() {
		return t(this.elementaryStream.info.decoderConfig), this.elementaryStream.info.decoderConfig;
	}
	allPacketsAreKeyPackets() {
		return !0;
	}
	getReorderSize() {
		return 0;
	}
}, Da = (e, t) => {
	let n = e.referencePesPackets, r = O(n, t.sectionStartPos, (e) => e.sectionStartPos);
	if (r >= 0) {
		let i = n[r];
		if (t.pts <= i.pts) return !1;
		let a = e.demuxer.minReferencePointByteDistance;
		if (t.sectionStartPos - i.sectionStartPos < a) return !1;
		if (r < n.length - 1) {
			let e = n[r + 1];
			if (e.pts < t.pts || e.sectionStartPos - t.sectionStartPos < a) return !1;
		}
	}
	return n.splice(r + 1, 0, t), !0;
}, Oa = class {
	constructor(e, t) {
		this.currentPos = 0, this.pesPackets = [], this.currentPesPacketIndex = 0, this.currentPesPacketPos = 0, this.endPos = 0, this.lastSuppliedPesPacket = null, this.nextPts = null, this.suppliedPacket = null, this.elementaryStream = e, this.pid = e.pid, this.demuxer = e.demuxer, this.startingPesPacket = t;
	}
	ensureBuffered(e) {
		let t = this.endPos - this.currentPos;
		return t >= e ? e : this.bufferData(e - t).then(() => Math.min(this.endPos - this.currentPos, e));
	}
	getCurrentPesPacket() {
		let e = this.pesPackets[this.currentPesPacketIndex];
		return t(e), e;
	}
	async bufferData(e) {
		let n = this.endPos + e;
		for (; this.endPos < n;) {
			let e;
			if (this.pesPackets.length === 0) e = this.startingPesPacket;
			else {
				let n = r(this.pesPackets).sectionEndPos;
				for (t(n !== null);;) {
					let t = await this.demuxer.readPacketHeader(n);
					if (!t) return;
					if (t.pid === this.pid) {
						let t = await this.demuxer.readSection(n, !0);
						if (!t) return;
						let r = Ca(t, !1);
						if (r) {
							e = r;
							break;
						}
					}
					n += this.demuxer.packetStride;
				}
			}
			this.pesPackets.push(e), this.endPos += e.data.byteLength;
		}
	}
	readBytes(e) {
		let t = this.getCurrentPesPacket(), n = this.currentPos - this.currentPesPacketPos, r = n + e;
		if (this.currentPos += e, r <= t.data.byteLength) return t.data.subarray(n, r);
		let i = new Uint8Array(e);
		i.set(t.data.subarray(n));
		let a = t.data.byteLength - n;
		for (;;) {
			this.advanceCurrentPacket();
			let t = this.getCurrentPesPacket(), n = e - a;
			if (n <= t.data.byteLength) {
				i.set(t.data.subarray(0, n), a);
				break;
			}
			i.set(t.data, a), a += t.data.byteLength;
		}
		return i;
	}
	readU8() {
		let e = this.getCurrentPesPacket(), t = this.currentPos - this.currentPesPacketPos;
		return this.currentPos++, t < e.data.byteLength ? e.data[t] : (this.advanceCurrentPacket(), e = this.getCurrentPesPacket(), e.data[0]);
	}
	seekTo(e) {
		if (e !== this.currentPos) {
			if (e < this.currentPos) for (; e < this.currentPesPacketPos;) {
				this.currentPesPacketIndex--;
				let e = this.getCurrentPesPacket();
				this.currentPesPacketPos -= e.data.byteLength;
			}
			else for (;;) {
				let t = this.getCurrentPesPacket();
				if (e < this.currentPesPacketPos + t.data.byteLength) break;
				this.currentPesPacketPos += t.data.byteLength, this.currentPesPacketIndex++;
			}
			this.currentPos = e;
		}
	}
	skip(e) {
		this.seekTo(this.currentPos + e);
	}
	advanceCurrentPacket() {
		this.currentPesPacketPos += this.getCurrentPesPacket().data.byteLength, this.currentPesPacketIndex++;
	}
	async markNextPacket() {
		t(!this.suppliedPacket);
		let e = this.elementaryStream;
		if (e.info.type === "video") {
			let t = e.info.codec, n = 1024;
			if (t !== "avc" && t !== "hevc") throw Error("Unhandled.");
			let r = t === "avc" ? 1 : 2, a = null, o = !1, s = 0;
			for (;;) {
				let e = this.ensureBuffered(n);
				if (A(e) && (e = await e), e === 0) break;
				let c = this.currentPos, l = this.readBytes(e), u = l.byteLength, d = 0;
				for (; d < u;) {
					let e = l.indexOf(0, d);
					if (e === -1 || e >= u) break;
					d = e;
					let n = c + d;
					if (d + 3 >= u) {
						this.seekTo(n);
						break;
					}
					let f = l[d + 1], p = l[d + 2], m = l[d + 3], h = 0;
					if (f === 0 && p === 0 && m === 1 ? h = 4 : f === 0 && p === 1 && (h = 3), h === 0) {
						d++;
						continue;
					}
					let g = n;
					a ??= g;
					let _ = d + h, v = _ + r;
					if (v + (t === "avc" ? 6 : 1) > u) {
						this.seekTo(n);
						break;
					}
					let y = l[_], b, x, S;
					if (t === "avc") b = gt(y), x = b === N.NON_IDR_SLICE || b === N.SLICE_DPA || b === N.IDR, S = b === N.SEI || b === N.SPS || b === N.PPS || b === N.AUD;
					else {
						if (b = kt(y), ((y & 1) << 5 | l[_ + 1] >> 3) > 0) {
							d += h;
							continue;
						}
						x = b <= P.RASL_R || b >= P.BLA_W_LP && b <= 21, S = b >= P.VPS_NUT && b <= 37 || b === P.PREFIX_SEI_NUT || b >= 41 && b <= 44 || b >= 48 && b <= 55;
					}
					let C = !1;
					if (x) {
						let e;
						if (t === "avc") {
							let t = i(new M(l.subarray(v, v + 6)));
							e = !o || t <= s, s = t;
						} else e = l[v] >> 7 == 1;
						e && (o ? C = !0 : o = !0);
					} else S && o && (C = !0);
					if (C) {
						let e = g - a;
						return this.seekTo(a), this.supplyPacket(e, 0);
					}
					d += h;
				}
				if (e < n) break;
			}
			if (a !== null && this.endPos > a) {
				let e = this.endPos - a;
				return this.seekTo(a), this.supplyPacket(e, 0);
			}
		} else {
			let n = e.info.codec;
			for (;;) {
				let r = this.ensureBuffered(128);
				A(r) && (r = await r);
				let i = this.currentPos;
				for (; this.currentPos - i < r;) {
					let r = this.readU8();
					if (n === "aac") {
						if (r !== 255) continue;
						this.skip(-1);
						let t = this.currentPos, n = this.ensureBuffered(9);
						if (A(n) && (n = await n), n < 9) return;
						let i = this.readBytes(9), a = ea(Js.tempFromBytes(i));
						if (a) {
							this.seekTo(t);
							let n = this.ensureBuffered(a.frameLength);
							return A(n) && (n = await n), this.supplyPacket(n, Math.round(ta * fa / e.info.sampleRate));
						}
						this.seekTo(t + 1);
					} else if (n === "mp3") {
						if (r !== 255) continue;
						this.skip(-1);
						let t = this.currentPos, n = this.ensureBuffered(4);
						if (A(n) && (n = await n), n < 4) return;
						let i = mr(c(this.readBytes(4)).getUint32(0), null);
						if (i.header) {
							this.seekTo(t);
							let n = this.ensureBuffered(i.header.totalSize);
							A(n) && (n = await n);
							let r = i.header.audioSamplesInFrame * fa / e.info.sampleRate;
							return this.supplyPacket(n, Math.round(r));
						}
						this.seekTo(t + 1);
					} else if (n === "ac3") {
						if (r !== 11) continue;
						this.skip(-1);
						let n = this.currentPos, i = this.ensureBuffered(5);
						if (A(i) && (i = await i), i < 5) return;
						let a = this.readBytes(5);
						if (a[0] !== 11 || a[1] !== 119) {
							this.seekTo(n + 1);
							continue;
						}
						let o = a[4] >> 6, s = a[4] & 63;
						if (o === 3 || s > 37) {
							this.seekTo(n + 1);
							continue;
						}
						let c = rn[3 * s + o];
						t(c !== void 0), this.seekTo(n), i = this.ensureBuffered(c), A(i) && (i = await i);
						let l = Math.round(an * fa / e.info.sampleRate);
						return this.supplyPacket(i, l);
					} else if (n === "eac3") {
						if (r !== 11) continue;
						this.skip(-1);
						let t = this.currentPos, n = this.ensureBuffered(5);
						if (A(n) && (n = await n), n < 5) return;
						let i = this.readBytes(5);
						if (i[0] !== 11 || i[1] !== 119) {
							this.seekTo(t + 1);
							continue;
						}
						let a = (((i[2] & 7) << 8 | i[3]) + 1) * 2, o = on[i[4] >> 6 == 3 ? 3 : i[4] >> 4 & 3];
						this.seekTo(t), n = this.ensureBuffered(a), A(n) && (n = await n);
						let s = o * 256, c = Math.round(s * fa / e.info.sampleRate);
						return this.supplyPacket(n, c);
					} else if (n === "dts") {
						if (r !== 127 && r !== 100) continue;
						this.skip(-1);
						let t = this.currentPos, n = this.ensureBuffered(18);
						if (A(n) && (n = await n), n < 18) return;
						let i = this.readBytes(18), a = Tn(i), o = a ? null : En(i);
						if (!a && !o) {
							this.seekTo(t + 1);
							continue;
						}
						if (o && !o.asset) {
							this.seekTo(t);
							let e = Math.min(o.frameSize, dn), n = this.ensureBuffered(e);
							A(n) && (n = await n), o = En(this.readBytes(n)) ?? o;
						}
						let s = a ? a.frameSize : o.frameSize;
						if (a) {
							let e = Math.ceil(a.frameSize / 4) * 4;
							for (;;) {
								this.seekTo(t);
								let n = e + 10, r = this.ensureBuffered(n);
								if (A(r) && (r = await r), r < n) break;
								this.seekTo(t + e);
								let i = En(this.readBytes(10));
								if (!i) break;
								e += i.frameSize, s = e;
							}
						}
						let c = a?.sampleCount ?? o.asset?.sampleCount;
						if (c === void 0) {
							this.seekTo(t + 1);
							continue;
						}
						this.seekTo(t), n = this.ensureBuffered(s), A(n) && (n = await n);
						let l = Math.round(c * fa / e.info.sampleRate);
						return this.supplyPacket(n, l);
					} else throw Error("Unhandled.");
				}
				if (r < 128) break;
			}
		}
	}
	supplyPacket(e, n) {
		let r = this.getCurrentPesPacket(), i;
		if (this.lastSuppliedPesPacket === r) t(this.nextPts !== null), i = this.nextPts;
		else {
			if (r.pts === null) throw Error(ma);
			i = r.pts, Da(this.elementaryStream, r);
		}
		this.lastSuppliedPesPacket = r, this.nextPts = i + n;
		let a = r.sectionStartPos, o = a + (this.currentPos - this.currentPesPacketPos), s = this.readBytes(e), c = r.randomAccessIndicator;
		if (c === 0 && !this.elementaryStream.canBeTrustedWithKeyPackets) {
			if (this.elementaryStream.info.type === "audio") c = 1;
			else if (this.elementaryStream.info.decoderConfig) {
				let e = Qt(this.elementaryStream.info.codec, this.elementaryStream.info.decoderConfig, s) === "key";
				c = Number(e);
			}
		}
		this.suppliedPacket = {
			pts: i,
			data: s,
			sequenceNumber: o,
			sectionStartPos: a,
			randomAccessIndicator: c
		}, this.pesPackets.splice(0, this.currentPesPacketIndex), this.currentPesPacketIndex = 0;
	}
}, ka = class {
	constructor(e, n) {
		this.decodeOrderPackets = [], this.reorderBuffer = [], this.presentationOrderPackets = [], this.reachedEnd = !1, this.lastDuration = 0, this.backing = e, this.context = n, this.reorderSize = e.getReorderSize(), t(this.reorderSize >= 0);
	}
	async readNext() {
		if (this.decodeOrderPackets.length === 0 && !await this.readNextPacket()) return null;
		await this.ensureCurrentPacketHasNext();
		let e = this.decodeOrderPackets[0], n = this.presentationOrderPackets.indexOf(e);
		t(n !== -1);
		let r;
		for (n === this.presentationOrderPackets.length - 1 ? r = this.lastDuration : (r = this.presentationOrderPackets[n + 1].pts - e.pts, this.lastDuration = r), this.decodeOrderPackets.shift(); this.presentationOrderPackets.length > 0;) {
			let e = this.presentationOrderPackets[0];
			if (this.decodeOrderPackets.includes(e)) break;
			this.presentationOrderPackets.shift();
		}
		return {
			packet: e,
			duration: r
		};
	}
	async readNextPacket() {
		if (this.reachedEnd) return !1;
		let e;
		return this.context.suppliedPacket || await this.context.markNextPacket(), e = this.context.suppliedPacket, this.context.suppliedPacket = null, e ? (this.decodeOrderPackets.push(e), this.processPacketThroughReorderBuffer(e), !0) : (this.reachedEnd = !0, this.flushReorderBuffer(), !1);
	}
	async ensureCurrentPacketHasNext() {
		let e = this.decodeOrderPackets[0];
		for (t(e);;) {
			let t = this.presentationOrderPackets.indexOf(e);
			if (t !== -1 && t <= this.presentationOrderPackets.length - 2 || !await this.readNextPacket()) break;
		}
	}
	processPacketThroughReorderBuffer(e) {
		if (this.reorderBuffer.push(e), this.reorderBuffer.length > this.reorderSize) {
			let e = 0;
			for (let t = 1; t < this.reorderBuffer.length; t++) this.reorderBuffer[t].pts < this.reorderBuffer[e].pts && (e = t);
			let t = this.reorderBuffer[e];
			this.presentationOrderPackets.push(t), this.reorderBuffer.splice(e, 1);
		}
	}
	flushReorderBuffer() {
		this.reorderBuffer.sort((e, t) => e.pts - t.pts), this.presentationOrderPackets.push(...this.reorderBuffer), this.reorderBuffer.length = 0;
	}
}, Aa = "application/vnd.apple.mpegurl", ja = "#EXT-X-STREAM-INF:", Ma = "#EXT-X-I-FRAME-STREAM-INF:", Na = "#EXT-X-MEDIA:", Pa = "#EXTINF:", Fa = "#EXT-X-MAP:", Ia = "#EXT-X-KEY:", La = "#EXT-X-MEDIA-SEQUENCE:", Ra = "#EXT-X-BYTERANGE:", za = "#EXT-X-PROGRAM-DATE-TIME:", Ba = "#EXT-X-TARGETDURATION:", Va = (e) => e.length === 0 || e.startsWith("#") && !e.startsWith("#EXT"), Ha = class {
	constructor(e) {
		this._attributes = {};
		let t = "", n = "", r = !1, i = !1;
		for (let a = 0; a < e.length; a++) {
			let o = e[a];
			o === "\"" ? i = !i : o === "=" && !r && !i ? r = !0 : o === "," && !i ? (t && (this._attributes[t.trim().toLowerCase()] = n), t = "", n = "", r = !1) : r ? n += o : t += o;
		}
		t && (this._attributes[t.trim().toLowerCase()] = n);
	}
	get(e) {
		return this._attributes[e.toLowerCase()] ?? null;
	}
	getAsNumber(e) {
		let t = this.get(e);
		if (t === null) return null;
		let n = Number(t);
		return Number.isFinite(n) ? n : null;
	}
	merge(e) {
		Object.assign(this._attributes, e._attributes);
	}
}, Ua = class {
	constructor(e, t, n) {
		this.nextInputCacheAge = 0, this.inputCache = [], this.trackBackingsPromise = null, this.firstSegment = null, this.firstSegmentFirstTimestamps = /* @__PURE__ */ new WeakMap(), this.firstTimestampCache = /* @__PURE__ */ new WeakMap(), this.input = e, this.path = t, this.trackDeclarations = n;
	}
	async getDurationFromMetadata(e) {
		let t = await this.getSegmentAt(Infinity, { skipLiveWait: e.skipLiveWait });
		return t ? t.timestamp + t.duration : null;
	}
	async getUnixTimeForTimestamp(e) {
		let t = await this.getSegmentAt(e, {});
		if (t ??= await this.getFirstSegment({}), !t || t.unixEpochTimestamp === null) return null;
		let n = e - t.timestamp;
		return t.unixEpochTimestamp + n;
	}
	async getTrackBackings() {
		return this.trackBackingsPromise ??= (async () => {
			let e = [];
			if (this.trackDeclarations) {
				for (let t of this.trackDeclarations) if (t.type === "video") {
					let n = He(e, (e) => e.getType() === "video") + 1;
					e.push(new Ga(this, t, n));
				} else if (t.type === "audio") {
					let n = He(e, (e) => e.getType() === "audio") + 1;
					e.push(new Ka(this, t, n));
				}
			} else {
				if (this.firstSegment = await this.getFirstSegment({}), !this.firstSegment) return [];
				let t = await this.getInputForSegment(this.firstSegment).getTracks();
				for (let n of t) if (n.type === "video") {
					let t = He(e, (e) => e.getType() === "video") + 1;
					e.push(new Ga(this, {
						id: e.length + 1,
						type: "video"
					}, t));
				} else if (n.type === "audio") {
					let t = He(e, (e) => e.getType() === "audio") + 1;
					e.push(new Ka(this, {
						id: e.length + 1,
						type: "audio"
					}, t));
				}
			}
			return e;
		})();
	}
	async getFirstTimestampForInput(e) {
		let t = this.firstTimestampCache.get(e);
		if (t !== void 0) return t;
		let n = await e.getFirstTimestamp();
		return this.firstTimestampCache.set(e, n), n;
	}
	async getMediaOffset(e, t) {
		let n = e.firstSegment ?? e, r;
		if (this.firstSegmentFirstTimestamps.has(n)) r = this.firstSegmentFirstTimestamps.get(n);
		else {
			let e = this.getInputForSegment(n);
			r = await this.getFirstTimestampForInput(e), this.firstSegmentFirstTimestamps.set(n, r);
		}
		if (n === e) return n.timestamp - r;
		let i = await this.getFirstTimestampForInput(t), a = e.timestamp - n.timestamp, o = i - r - a;
		return Math.abs(o) <= Math.min(.25, a) ? n.timestamp - r : e.timestamp - i;
	}
	dispose() {
		for (let e of this.inputCache) e.input.dispose();
		this.inputCache.length = 0;
	}
}, Wa = class {
	constructor(e, t, n) {
		this.packetInfos = /* @__PURE__ */ new WeakMap(), this.hydrationPromise = null, this.firstInputTrack = null, this.firstSegment = null, this.segmentedInput = e, this.decl = t, this.number = n;
	}
	hydrate() {
		return this.hydrationPromise ??= (async () => {
			if (this.segmentedInput.firstSegment ??= await this.segmentedInput.getFirstSegment({}), !this.segmentedInput.firstSegment) throw Error("Missing first segment, can't retrieve track.");
			let e = this.segmentedInput.firstSegment, t = null;
			for (; e && (t = (await this.segmentedInput.getInputForSegment(e).getTracks()).find((e) => e.type === this.decl.type && e.number === this.number) ?? null, !t);) e = await this.segmentedInput.getNextSegment(e, {});
			if (!t) throw Error("No matching track found in underlying media data.");
			this.firstInputTrack = t, this.firstSegment = e;
		})();
	}
	getId() {
		return this.decl.id;
	}
	getType() {
		return this.decl.type;
	}
	getNumber() {
		return this.number;
	}
	delegate(e) {
		return this.firstInputTrack ? e() : this.hydrate().then(e);
	}
	async getDecoderConfig() {
		return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
	}
	getHasOnlyKeyPackets() {
		return this.delegate(() => this.firstInputTrack._backing.getHasOnlyKeyPackets?.() ?? null);
	}
	getPairingMask() {
		return 1n;
	}
	getCodec() {
		return this.delegate(() => this.firstInputTrack._backing.getCodec());
	}
	getInternalCodecId() {
		return this.delegate(() => this.firstInputTrack._backing.getInternalCodecId());
	}
	getDisposition() {
		return this.delegate(() => this.firstInputTrack._backing.getDisposition());
	}
	getLanguageCode() {
		return this.delegate(() => this.firstInputTrack._backing.getLanguageCode());
	}
	getName() {
		return this.delegate(() => this.firstInputTrack._backing.getName());
	}
	getTimeResolution() {
		return this.delegate(() => this.firstInputTrack._backing.getTimeResolution());
	}
	async isRelativeToUnixEpoch() {
		return await this.hydrate(), t(this.segmentedInput.firstSegment), this.segmentedInput.firstSegment.unixEpochTimestamp === this.segmentedInput.firstSegment.timestamp;
	}
	getUnixTimeForTimestamp(e) {
		return this.segmentedInput.getUnixTimeForTimestamp(e);
	}
	getBitrate() {
		return this.delegate(() => this.firstInputTrack._backing.getBitrate());
	}
	getAverageBitrate() {
		return this.delegate(() => this.firstInputTrack._backing.getAverageBitrate());
	}
	getDurationFromMetadata(e) {
		return this.segmentedInput.getDurationFromMetadata(e);
	}
	getLiveRefreshInterval() {
		return this.segmentedInput.getLiveRefreshInterval();
	}
	async createAdjustedPacket(e, n, r) {
		t(e.sequenceNumber >= 0), t(this.segmentedInput.firstSegment);
		let i = await this.segmentedInput.getMediaOffset(n, r.input), a = n.timestamp - this.segmentedInput.firstSegment.timestamp, o = e.clone({
			timestamp: pe(e.timestamp + i, await r.getTimeResolution()),
			sequenceNumber: Math.floor(1e8 * a) + e.sequenceNumber
		});
		return this.packetInfos.set(o, {
			segment: n,
			track: r,
			sourcePacket: e
		}), o;
	}
	async getFirstPacket(e) {
		await this.hydrate(), t(this.firstInputTrack), t(this.firstSegment);
		let n = this.firstInputTrack, r = this.firstSegment;
		for (;;) {
			if (n) {
				let t = await n._backing.getFirstPacket(e);
				if (t) return this.createAdjustedPacket(t, r, n);
			}
			if (r = await this.segmentedInput.getNextSegment(r, { skipLiveWait: e.skipLiveWait }), !r) break;
			n = (await this.segmentedInput.getInputForSegment(r).getTracks()).find((e) => e.type === this.firstInputTrack.type && e.number === this.firstInputTrack.number) ?? null;
		}
		return null;
	}
	getNextPacket(e, t) {
		return this._getNextInternal(e, t, !1);
	}
	getNextKeyPacket(e, t) {
		return this._getNextInternal(e, t, !0);
	}
	async _getNextInternal(e, t, n) {
		let r = this.packetInfos.get(e);
		if (!r) throw Error("Packet was not created from this track.");
		let i = n ? await r.track._backing.getNextKeyPacket(r.sourcePacket, t) : await r.track._backing.getNextPacket(r.sourcePacket, t);
		if (i) return this.createAdjustedPacket(i, r.segment, r.track);
		let a = r.segment;
		for (;;) {
			let e = await this.segmentedInput.getNextSegment(a, { skipLiveWait: t.skipLiveWait });
			if (!e) return null;
			let n = (await this.segmentedInput.getInputForSegment(e).getTracks()).find((e) => e.type === r.track.type && e.number === r.track.number);
			if (!n) {
				a = e;
				continue;
			}
			let i = await n._backing.getFirstPacket(t);
			return i ? this.createAdjustedPacket(i, e, n) : null;
		}
	}
	getPacket(e, t) {
		return this._getPacketInternal(e, t, !1);
	}
	getKeyPacket(e, t) {
		return this._getPacketInternal(e, t, !0);
	}
	async _getPacketInternal(e, t, n) {
		let r = await this.segmentedInput.getSegmentAt(e, { skipLiveWait: t.skipLiveWait });
		if (!r) return null;
		for (await this.hydrate(); r;) {
			let i = this.segmentedInput.getInputForSegment(r), a = (await i.getTracks()).find((e) => e.type === this.firstInputTrack.type && e.number === this.firstInputTrack.number);
			if (!a) {
				r = await this.segmentedInput.getPreviousSegment(r, { skipLiveWait: t.skipLiveWait });
				continue;
			}
			let o = e - await this.segmentedInput.getMediaOffset(r, i), s = n ? await a._backing.getKeyPacket(o, t) : await a._backing.getPacket(o, t);
			if (!s) {
				r = await this.segmentedInput.getPreviousSegment(r, { skipLiveWait: t.skipLiveWait });
				continue;
			}
			return this.createAdjustedPacket(s, r, a);
		}
		return null;
	}
}, Ga = class extends Wa {
	getType() {
		return "video";
	}
	getCodec() {
		return this.delegate(() => this.firstInputTrack._backing.getCodec());
	}
	getCodedWidth() {
		return this.delegate(() => this.firstInputTrack._backing.getCodedWidth());
	}
	getCodedHeight() {
		return this.delegate(() => this.firstInputTrack._backing.getCodedHeight());
	}
	getSquarePixelWidth() {
		return this.delegate(() => this.firstInputTrack._backing.getSquarePixelWidth());
	}
	getSquarePixelHeight() {
		return this.delegate(() => this.firstInputTrack._backing.getSquarePixelHeight());
	}
	getRotation() {
		return this.delegate(() => this.firstInputTrack._backing.getRotation());
	}
	async getColorSpace() {
		return this.delegate(() => this.firstInputTrack._backing.getColorSpace());
	}
	async canBeTransparent() {
		return this.delegate(() => this.firstInputTrack._backing.canBeTransparent());
	}
	async getDecoderConfig() {
		return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
	}
}, Ka = class extends Wa {
	getType() {
		return "audio";
	}
	getCodec() {
		return this.delegate(() => this.firstInputTrack._backing.getCodec());
	}
	getNumberOfChannels() {
		return this.delegate(() => this.firstInputTrack._backing.getNumberOfChannels());
	}
	getSampleRate() {
		return this.delegate(() => this.firstInputTrack._backing.getSampleRate());
	}
	async getDecoderConfig() {
		return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
	}
};
(/* @__PURE__ */ e(((e, t) => {
	t.exports = {};
})))(), ze();
var qa = Infinity;
typeof FinalizationRegistry < "u" && new FinalizationRegistry((e) => {
	e();
});
var Ja = class extends Je {
	constructor() {
		super(), this._disposed = !1, this._refCount = 0, this._usedForHls = !1, this._refFinalizationRegistry = null, this._sizePromise = null, this.onread = null, typeof FinalizationRegistry < "u" && (this._refFinalizationRegistry = new FinalizationRegistry((e) => {
			e._decrementRefCount();
		}));
	}
	async getSizeOrNull() {
		if (this._disposed) throw new G();
		return this._sizePromise ??= (async () => {
			let e = this._getFileSize();
			return e === void 0 ? (await this._read(0, 1, 0, qa), e = this._getFileSize(), t(e !== void 0), e) : e;
		})();
	}
	async getSize() {
		if (this._disposed) throw new G();
		let e = await this.getSizeOrNull();
		if (e === null) throw Error("Cannot determine the size of an unsized source.");
		return e;
	}
	slice(e, t) {
		if (!Number.isInteger(e) || e < 0) throw TypeError("offset must be a non-negative integer.");
		if (t !== void 0 && (!Number.isInteger(t) || t < 0)) throw TypeError("length, when provided, must be a non-negative integer.");
		return new co(this, e, t);
	}
	_dispatchRead(e, t) {
		this.onread?.(e, t), this._emit("read", {
			start: e,
			end: t
		});
	}
	ref() {
		return new Ya(this);
	}
	_incrementRefCount() {
		this._refCount++;
	}
	_decrementRefCount() {
		this._refCount--, this._refCount === 0 && (this._dispose(), this._disposed = !0);
	}
}, Ya = class {
	constructor(e) {
		if (this._freed = !1, e._disposed) throw Error("Cannot ref a disposed source.");
		e._incrementRefCount(), e._refFinalizationRegistry?.register(this, e, this), this._source = e;
	}
	get source() {
		if (!this._source) throw Error("Can't get source; ref has already been freed.");
		return this._source;
	}
	get freed() {
		return this._freed;
	}
	free() {
		if (this._freed) throw Error("Illegal operation: double free on SourceRef.");
		let e = this.source;
		t(e._refCount > 0), e._decrementRefCount(), e._refFinalizationRegistry?.unregister(this), this._freed = !0, this._source = null;
	}
	[Symbol.dispose]() {
		this.freed || this.free();
	}
}, Xa = class extends Ja {
	constructor(e, t) {
		if (typeof e != "string") throw TypeError("rootPath must be a string.");
		if (typeof t != "function") throw TypeError("requestHandler must be a function.");
		super(), this.rootPath = e, this.requestHandler = t;
	}
	_resolveRequest(e) {
		let t = this.requestHandler(e), n = (e) => {
			if (!(e instanceof Ja || e instanceof Ya)) throw TypeError("requestHandler must return or resolve to a Source or SourceRef.");
			let t = e instanceof Ja ? e.ref() : e;
			return t.source._usedForHls ||= this._usedForHls, t;
		};
		return A(t) ? t.then(n) : n(t);
	}
}, Za = (e, t) => e.path === t.path, Qa = class extends Xa {
	constructor() {
		super(...arguments), this._root = null, this._rootRequest = null;
	}
	_read(e, n, r, i) {
		if (!this._root) {
			if (!this._rootRequest) {
				let e = this._resolveRequest({
					path: this.rootPath,
					isRoot: !0
				}), n = (e) => {
					let t = e instanceof Ja ? e.ref() : e;
					return this._root = t, this._rootRequest = null, t;
				};
				A(e) ? this._rootRequest = e.then(n) : (n(e), t(this._root));
			}
			if (this._rootRequest) return this._rootRequest.then((t) => t.source._read(e, n, r, i));
		}
		return this._root.source._read(e, n, r, i);
	}
	_getFileSize() {
		if (this._root) return this._root.source._getFileSize();
	}
	_dispose() {
		this._root ? this._root.free() : this._rootRequest && this._rootRequest.then((e) => e.free());
	}
};
typeof FinalizationRegistry < "u" && new FinalizationRegistry((e) => {
	e.cancel().catch(() => {});
});
var $a = .5 * 2 ** 20, eo = ((e, t, n) => {
	if (t instanceof Error && (t.message.includes("Failed to fetch") || t.message.includes("Load failed") || t.message.includes("NetworkError when attempting to fetch resource")) && typeof window < "u") {
		let e = null;
		try {
			typeof window < "u" && window.location !== void 0 && (e = new URL(n instanceof Request ? n.url : n, window.location.href).origin);
		} catch {}
		if ((!(typeof navigator < "u" && typeof navigator.onLine == "boolean") || navigator.onLine) && e !== null && e !== window.location.origin) return j._warn("Request will not be retried because a CORS error was suspected due to different origins. You can modify this behavior by providing your own function for the 'getRetryDelay' option."), null;
	}
	return Math.min(2 ** (e - 2), 16);
}), to = /* @__PURE__ */ new Set(), no = class e extends Xa {
	constructor(t, n = {}) {
		if (typeof t != "string" && !(t instanceof URL) && !(typeof Request < "u" && t instanceof Request)) throw TypeError("url must be a string, URL or Request.");
		if (!n || typeof n != "object") throw TypeError("options must be an object.");
		if (n.requestInit !== void 0 && (!n.requestInit || typeof n.requestInit != "object")) throw TypeError("options.requestInit, when provided, must be an object.");
		if (n.getRetryDelay !== void 0 && typeof n.getRetryDelay != "function") throw TypeError("options.getRetryDelay, when provided, must be a function.");
		if (n.maxCacheSize !== void 0 && (!Be(n.maxCacheSize) || n.maxCacheSize < 0)) throw TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
		if (n.parallelism !== void 0 && (!Number.isInteger(n.parallelism) || n.parallelism < 1)) throw TypeError("options.parallelism, when provided, must be a positive number.");
		if (n.fetchFn !== void 0 && typeof n.fetchFn != "function") throw TypeError("options.fetchFn, when provided, must be a function.");
		let r = t instanceof Request ? t.url : t instanceof URL ? t.href : t;
		super(r, (t) => new e(t.path, this._options)), this._offset = 0, this._length = null, this._fileSizeDetermined = !1, this._sequentialBacking = null, this._url = t, this._options = n, this._getRetryDelay = n.getRetryDelay ?? eo, this._requestInit = { ...n.requestInit };
		let i = null;
		if (n.requestInit?.headers) {
			let e = { ...Se(n.requestInit.headers) }, t = Object.keys(e).find((e) => e.toLowerCase() === "range");
			t !== void 0 && (i = e[t], delete e[t], this._requestInit.headers = e);
		}
		if (t instanceof Request) {
			let e = t.headers.get("Range");
			if (e !== null) {
				i ??= e;
				let n = new Request(t);
				n.headers.delete("Range"), this._url = n;
			}
		}
		if (i !== null) {
			let e = io(i);
			e && (this._offset = e.offset, this._length = e.length);
		}
		this._orchestrator = new so({
			maxCacheSize: n.maxCacheSize ?? 64 * 2 ** 20,
			maxWorkerCount: n.parallelism ?? 2,
			runWorker: this._runWorker.bind(this),
			prefetchProfile: oo.network
		});
	}
	_getFileSize() {
		if (!this._fileSizeDetermined) return this._length === null ? void 0 : this._length;
		let e = this._sequentialBacking ? this._sequentialBacking._endIndex : this._orchestrator.fileSize;
		return e === null ? this._length === null ? null : this._length : le(e - this._offset, 0, this._length ?? Infinity);
	}
	_read(e, t, n, r) {
		if (this._length !== null && t > this._length) return null;
		let i = this._offset, a = this._sequentialBacking ? this._sequentialBacking._read(i + e, i + t) : this._orchestrator.read(i + e, i + t, Math.max(i + n, i), i + Math.min(r, this._length ?? Infinity)), o = (e) => e ? (e.offset -= this._offset, e) : null;
		return A(a) ? a.then(o) : o(a);
	}
	async _runWorker(e) {
		for (;;) {
			let t = new AbortController(), n = await Ce(this._options.fetchFn ?? fetch, this._url, xe(this._requestInit, {
				headers: { Range: `bytes=${e.currentPos}-` },
				signal: t.signal
			}), this._getRetryDelay, () => this._disposed);
			if (!n.ok) throw Error(`Error fetching ${String(this._url)}: ${n.status} ${n.statusText}`);
			n.redirected && (this.rootPath = n.url);
			outer: if (this._orchestrator.fileSize === null) {
				let t = n.headers.get("Content-Range");
				if (t) {
					let e = /\/(\d+)/.exec(t);
					if (e) {
						this._orchestrator.supplyFileSize(Number(e[1]));
						break outer;
					}
				}
				let r = n.headers.get("Content-Length");
				if (r) {
					let t = n.status === 206 ? e.currentPos : 0;
					this._orchestrator.supplyFileSize(t + Number(r));
				}
			}
			if (this._fileSizeDetermined = !0, !n.body) throw Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");
			if (n.status !== 206) {
				if (this._sequentialBacking) {
					n.body.cancel();
					return;
				}
				if (!this._usedForHls) {
					let e = new URL(this._url instanceof Request ? this._url.url : this._url, typeof window < "u" ? window.location.href : void 0);
					e.origin !== "null" && !(e.pathname.endsWith(".m3u8") || e.pathname.endsWith(".m3u")) && (to.has(e.origin) || (j._warn(`HTTP server (origin ${e.origin}) did not respond to a range request with 206 Partial Content, meaning the resource will now be streamed sequentially, with old data being evicted from the cache. Reads into evicted regions will throw. To enable efficient media file streaming across a network, please make sure your server supports range requests. Alternatively, set maxCacheSize to Infinity in the UrlSource options to keep the entire resource in memory.`), to.add(e.origin)));
				}
				this._transitionToSequentialMode(n.body);
				return;
			}
			let r = n.body.getReader();
			for (;;) {
				if (e.currentPos >= e.targetPos || e.aborted) {
					t.abort(), this._orchestrator.signalWorkerStoppedRunning(e);
					return;
				}
				let n;
				try {
					n = await r.read();
				} catch (e) {
					if (this._disposed) throw e;
					let t = this._getRetryDelay(1, e, this._url);
					if (t !== null) {
						j._error("Error while reading response stream. Attempting to resume.", e), await Ke(1e3 * t);
						break;
					}
					throw e;
				}
				if (e.aborted) continue;
				let { done: i, value: a } = n;
				if (i) {
					if (e.currentPos >= e.targetPos) {
						this._orchestrator.onWorkerFinished(e);
						return;
					}
					if (e.strictTarget) break;
					this._orchestrator.onWorkerFinished(e);
					return;
				}
				this._dispatchRead(e.currentPos, e.currentPos + a.length), this._orchestrator.supplyWorkerData(e, a);
			}
		}
	}
	_transitionToSequentialMode(e) {
		let n = e.getReader(), r = 0, i = 0, a = new ao(new ReadableStream({
			pull: async (e) => {
				for (;;) {
					let t;
					try {
						t = await n.read();
					} catch (e) {
						if (this._disposed) throw e;
						let t = this._getRetryDelay(1, e, this._url);
						if (t === null) throw e;
						j._error("Error while reading response stream. Attempting to resume.", e), await Ke(1e3 * t);
						let a = await Ce(this._options.fetchFn ?? fetch, this._url, xe(this._requestInit, { headers: { Range: `bytes=${r}-` } }), this._getRetryDelay, () => this._disposed);
						if (!a.ok) throw Error(`Error fetching ${String(this._url)}: ${a.status} ${a.statusText}`);
						if (!a.body) throw Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");
						n = a.body.getReader(), i = a.status === 206 ? 0 : r;
						continue;
					}
					if (t.done) {
						e.close();
						return;
					}
					let a = t.value;
					if (i > 0) {
						let e = Math.min(i, a.length);
						i -= e, a = a.subarray(e);
					}
					if (a.length !== 0) {
						r += a.length, e.enqueue(a);
						return;
					}
				}
			},
			cancel: () => n.cancel()
		}), { maxCacheSize: this._orchestrator.options.maxCacheSize });
		a._endIndex = this._orchestrator.fileSize, a._cacheMissErrorMessage = "Attempted to read data from an already-evicted part of the cache. Because the HTTP server did not honor the range request, data can only be read sequentially, with old data being evicted from the cache. To fix this issue, either ensure your server responds to range requests with 206 Partial Content, or set maxCacheSize to Infinity in the UrlSource options. Note that the latter will store the entire file in the cache if needed, no matter how large.", a.on("read", ({ start: e, end: t }) => this._dispatchRead(e, t)), this._sequentialBacking = a;
		let o = /* @__PURE__ */ new Set();
		for (let e of this._orchestrator.workers) {
			for (let t of e.pendingSlices) o.add(t);
			e.aborted = !0, e.pendingSlices.length = 0;
		}
		for (let e of this._orchestrator.queuedReads) for (let t of e.pendingSlices) o.add(t);
		this._orchestrator.workers.length = 0, this._orchestrator.queuedReads.length = 0;
		for (let e of o) {
			let n = a._read(e.start, e.start + e.bytes.length);
			A(n) ? n.then((n) => {
				n ? (t(n.offset === e.start), e.resolve(n.bytes)) : e.resolve(null);
			}, (t) => e.reject(t)) : (t(n === null), e.resolve(null));
		}
	}
	_dispose() {
		this._orchestrator.dispose(), this._sequentialBacking && (this._sequentialBacking._disposed = !0, this._sequentialBacking._dispose());
	}
}, ro = /^bytes=(\d+)-(\d*)$/, io = (e) => {
	let t = ro.exec(e.trim());
	if (!t) return null;
	let n = Number(t[1]), r = t[2] === "" ? null : Number(t[2]);
	return r !== null && r < n ? null : {
		offset: n,
		length: r === null ? null : r - n + 1
	};
}, ao = class extends Ja {
	constructor(e, t = {}) {
		if (!(e instanceof ReadableStream)) throw TypeError("stream must be a ReadableStream.");
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (t.maxCacheSize !== void 0 && (!Be(t.maxCacheSize) || t.maxCacheSize < 0)) throw TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
		super(), this._reader = null, this._cache = [], this._pendingSlices = [], this._currentIndex = 0, this._targetIndex = 0, this._maxRequestedIndex = 0, this._endIndex = null, this._pulling = !1, this._cacheMissErrorMessage = "Attempted to read data from an already-evicted part of the cache. With ReadableStreamSource, you must access the data more sequentially or increase the size of its cache.", this._stream = e, this._maxCacheSize = t.maxCacheSize ?? 32 * 2 ** 20;
	}
	_getFileSize() {
		return this._endIndex;
	}
	_read(e, t) {
		if (this._endIndex !== null && t > this._endIndex) return null;
		this._maxRequestedIndex = Math.max(this._maxRequestedIndex, t);
		let n = O(this._cache, e, (e) => e.start), r = n === -1 ? null : this._cache[n];
		if (r && r.start <= e && t <= r.end) return {
			bytes: r.bytes,
			view: r.view,
			offset: r.start
		};
		let i = e, a = new Uint8Array(t - e);
		if (n !== -1) for (let r = n; r < this._cache.length; r++) {
			let n = this._cache[r];
			if (n.start >= t) break;
			let o = Math.max(e, n.start);
			o > i && this._throwDueToCacheMiss();
			let s = Math.min(t, n.end);
			o < s && (a.set(n.bytes.subarray(o - n.start, s - n.start), o - e), i = s);
		}
		if (i === t) return {
			bytes: a,
			view: c(a),
			offset: e
		};
		this._currentIndex > i && this._throwDueToCacheMiss();
		let { promise: o, resolve: s, reject: l } = k();
		return this._pendingSlices.push({
			start: e,
			end: t,
			bytes: a,
			resolve: s,
			reject: l
		}), this._targetIndex = Math.max(this._targetIndex, t), this._pulling || (this._pulling = !0, this._pull().catch((e) => {
			if (this._pulling = !1, this._pendingSlices.length > 0) this._pendingSlices.forEach((t) => t.reject(e)), this._pendingSlices.length = 0;
			else throw e;
		})), o;
	}
	_throwDueToCacheMiss() {
		throw Error(this._cacheMissErrorMessage);
	}
	async _pull() {
		for (this._reader ??= this._stream.getReader(); this._currentIndex < this._targetIndex && !this._disposed;) {
			let { done: e, value: t } = await this._reader.read();
			if (e) {
				for (let e of this._pendingSlices) e.resolve(null);
				this._pendingSlices.length = 0, this._endIndex = this._currentIndex;
				break;
			}
			let n = this._currentIndex, r = this._currentIndex + t.byteLength;
			this._dispatchRead(n, r);
			for (let e = 0; e < this._pendingSlices.length; e++) {
				let i = this._pendingSlices[e], a = Math.max(n, i.start), o = Math.min(r, i.end);
				a < o && (i.bytes.set(t.subarray(a - n, o - n), a - i.start), o === i.end && (i.resolve({
					bytes: i.bytes,
					view: c(i.bytes),
					offset: i.start
				}), this._pendingSlices.splice(e, 1), e--));
			}
			for (this._cache.push({
				start: n,
				end: r,
				bytes: t,
				view: c(t),
				age: 0
			}); this._cache.length > 0;) {
				let e = this._cache[0];
				if (this._maxRequestedIndex - e.end <= this._maxCacheSize) break;
				this._cache.shift();
			}
			this._currentIndex += t.byteLength;
		}
		this._pulling = !1;
	}
	_dispose() {
		for (let e of this._pendingSlices) e.reject(new G());
		this._pendingSlices.length = 0, this._cache.length = 0, this._reader?.cancel();
	}
}, oo = {
	none: (e, t) => ({
		start: e,
		end: t
	}),
	fileSystem: (e, t) => {
		let n = 2 ** 16;
		return e = Math.floor((e - n) / n) * n, t = Math.ceil((t + n) / n) * n, {
			start: e,
			end: t
		};
	},
	network: (e, t, n) => {
		let r = 2 ** 16;
		e = Math.max(0, Math.floor((e - r) / r) * r);
		for (let r of n) {
			let n = 8 * 2 ** 20, i = Math.max((r.startPos + r.targetPos) / 2, r.targetPos - n);
			if (Pe(e, t, i, r.targetPos)) {
				let e = r.targetPos - r.startPos, i = Math.ceil((e + 1) / n) * n, a = 2 ** Math.ceil(Math.log2(e + 1)), o = Math.min(a, i);
				t = Math.max(t, r.startPos + o);
			}
		}
		return t = Math.max(t, e + $a), {
			start: e,
			end: t
		};
	}
}, so = class {
	constructor(e) {
		this.options = e, this.fileSize = null, this.nextAge = 0, this.workers = [], this.cache = [], this.currentCacheSize = 0, this.disposed = !1, this.queuedReads = [];
	}
	read(e, n, r, i) {
		t(!this.disposed);
		let a = this.options.prefetchProfile(e, n, this.workers), o = Math.max(a.start, r), s = Math.min(a.end, this.fileSize ?? Infinity, i);
		t(o <= e && n <= s);
		let l = null, u = O(this.cache, e, (e) => e.start), d = u === -1 ? null : this.cache[u];
		d && d.start <= e && n <= d.end && (d.age = this.nextAge++, l = {
			bytes: d.bytes,
			view: d.view,
			offset: d.start
		});
		let f = O(this.cache, o, (e) => e.start), p = l ? null : new Uint8Array(n - e), m = 0, h = o, g = [];
		if (f !== -1) {
			for (let r = f; r < this.cache.length; r++) {
				let i = this.cache[r];
				if (i.start >= s) break;
				if (i.end <= o) continue;
				let a = Math.max(o, i.start), c = Math.min(s, i.end);
				if (t(a <= c), h < a && g.push({
					start: h,
					end: a
				}), h = c, p) {
					let t = Math.max(e, i.start), r = Math.min(n, i.end);
					if (t < r) {
						let n = t - e;
						p.set(i.bytes.subarray(t - i.start, r - i.start), n), n === m && (m = r - e);
					}
				}
				i.age = this.nextAge++;
			}
			h < s && g.push({
				start: h,
				end: s
			});
		} else g.push({
			start: o,
			end: s
		});
		if (p && m >= p.length && (l = {
			bytes: p,
			view: c(p),
			offset: e
		}), g.length === 0) return t(l), l;
		let { promise: _, resolve: v, reject: y } = k(), b = [];
		for (let t of g) {
			let r = Math.max(e, t.start), i = Math.min(n, t.end);
			r === t.start && i === t.end ? b.push(t) : r < i && b.push({
				start: r,
				end: i
			});
		}
		let x = p && {
			start: e,
			bytes: p,
			holes: b,
			resolve: v,
			reject: y
		};
		outer: for (let e of g) {
			for (let t of this.workers) if (this.checkHoleAgainstWorker(t, e, x ? [x] : [])) {
				this.checkQueuedReadsAgainstWorker(t);
				continue outer;
			}
			let t = e.end < s || this.fileSize !== null, n = this.createWorker(e.start, e.end, t);
			if (n) x && (n.pendingSlices = [x]), this.runWorker(n);
			else {
				let n = O(this.queuedReads, e.start, (e) => e.hole.start), r = n === -1 ? null : this.queuedReads[n];
				for (r && e.start <= r.hole.end ? (r.hole.end = Math.max(r.hole.end, e.end), r.strictTarget &&= t, x && r.pendingSlices.push(x)) : (n++, r = {
					hole: {
						start: e.start,
						end: e.end
					},
					strictTarget: t,
					pendingSlices: x ? [x] : [],
					age: this.nextAge++
				}, this.queuedReads.splice(n, 0, r)); n + 1 < this.queuedReads.length;) {
					let e = this.queuedReads[n + 1];
					if (e.hole.start > r.hole.end) break;
					r.hole.end = Math.max(r.hole.end, e.hole.end), r.pendingSlices.push(...e.pendingSlices), r.strictTarget &&= e.strictTarget, r.age = Math.min(r.age, e.age), this.queuedReads.splice(n + 1, 1);
				}
			}
		}
		return l ? _.catch((e) => {
			if (!this.disposed) throw e;
		}) : (t(p), l = _.then((t) => t && {
			bytes: t,
			view: c(t),
			offset: e
		})), l;
	}
	checkHoleAgainstWorker(e, t, n) {
		if (Pe(t.start - 2 ** 17, t.start, e.currentPos, e.targetPos)) {
			e.targetPos = Math.max(e.targetPos, t.end);
			for (let t = 0; t < n.length; t++) {
				let r = n[t];
				e.pendingSlices.includes(r) || e.pendingSlices.push(r);
			}
			return e.running || this.runWorker(e), !0;
		}
		return !1;
	}
	checkQueuedReadsAgainstWorker(e) {
		let t = !1;
		for (let n = 0; n < this.queuedReads.length; n++) {
			let r = this.queuedReads[n];
			if (this.checkHoleAgainstWorker(e, r.hole, r.pendingSlices)) this.queuedReads.splice(n, 1), n--, t = !0;
			else if (t) break;
		}
	}
	createWorker(e, n, r) {
		if (this.workers.length >= this.options.maxWorkerCount) {
			let e = null, n = null;
			for (let t = 0; t < this.workers.length; t++) {
				let r = this.workers[t];
				!r.running && r.pendingSlices.length === 0 && (!e || r.age < e.age) && (n = t, e = r);
			}
			if (e) t(n !== null), t(e.pendingSlices.length === 0), this.workers.splice(n, 1), this.options.onIdleWorkerRemoved?.(e);
			else return null;
		}
		let i = {
			startPos: e,
			currentPos: e,
			targetPos: n,
			strictTarget: r,
			running: !1,
			aborted: this.disposed,
			pendingSlices: [],
			age: this.nextAge++
		};
		return this.workers.push(i), i;
	}
	runWorker(e) {
		t(!e.running), t(e.currentPos < e.targetPos), e.running = !0, e.age = this.nextAge++, this.options.runWorker(e).catch((t) => {
			if (e.running = !1, e.pendingSlices.length > 0) e.pendingSlices.forEach((e) => e.reject(t)), e.pendingSlices.length = 0;
			else if (!e.aborted && !this.disposed) throw t;
		}).finally(() => {
			if (!e.running && this.queuedReads.length > 0) {
				let e = 0;
				for (let t = 1; t < this.queuedReads.length; t++) this.queuedReads[t].age < this.queuedReads[e].age && (e = t);
				let t = this.queuedReads[e], n = this.createWorker(t.hole.start, t.hole.end, t.strictTarget);
				if (!n) return;
				this.queuedReads.splice(e, 1), n.pendingSlices = t.pendingSlices, this.runWorker(n);
			}
		});
	}
	supplyWorkerData(e, n) {
		t(!e.aborted);
		let r = e.currentPos, i = r + n.length;
		this.insertIntoCache({
			start: r,
			end: i,
			bytes: n,
			view: c(n),
			age: this.nextAge++
		}), e.currentPos += n.length, e.currentPos > e.targetPos && (e.targetPos = e.currentPos, this.checkQueuedReadsAgainstWorker(e));
		for (let t = 0; t < e.pendingSlices.length; t++) {
			let a = e.pendingSlices[t], o = Math.max(r, a.start), s = Math.min(i, a.start + a.bytes.length);
			o < s && a.bytes.set(n.subarray(o - r, s - r), o - a.start);
			for (let e = 0; e < a.holes.length; e++) {
				let t = a.holes[e];
				r <= t.start && i > t.start && (t.start = i), t.end <= t.start && (a.holes.splice(e, 1), e--);
			}
			a.holes.length === 0 && (a.resolve(a.bytes), e.pendingSlices.splice(t, 1), t--);
		}
		for (let t = 0; t < this.workers.length; t++) {
			let n = this.workers[t];
			e === n || n.running || Pe(r, i, n.currentPos, n.targetPos) && (this.workers.splice(t, 1), this.options.onIdleWorkerRemoved?.(n), t--);
		}
	}
	supplyFileSize(e) {
		t(this.fileSize === null), this.fileSize = e;
		for (let t of this.workers) {
			t.targetPos = Math.min(t.targetPos, e), t.strictTarget = !0;
			for (let n = 0; n < t.pendingSlices.length; n++) {
				let r = t.pendingSlices[n];
				for (let i of r.holes) if (i.end > e) {
					r.resolve(null), t.pendingSlices.splice(n, 1), n--;
					break;
				}
			}
		}
		for (let t = 0; t < this.queuedReads.length; t++) {
			let n = this.queuedReads[t];
			if (n.hole.start >= e) {
				for (let e of n.pendingSlices) e.resolve(null);
				this.queuedReads.splice(t, 1), t--;
			} else if (n.hole.end > e) {
				n.hole.end = e, n.strictTarget = !0;
				for (let t = 0; t < n.pendingSlices.length; t++) {
					let r = n.pendingSlices[t];
					r.start >= e && (r.resolve(null), n.pendingSlices.splice(t, 1), t--);
				}
			}
		}
	}
	signalWorkerStoppedRunning(e) {
		e.running = !1, e.aborted || (e.pendingSlices.length = 0);
	}
	onWorkerFinished(e) {
		let n = this.workers.indexOf(e);
		t(n !== -1), e.running = !1, this.workers.splice(n, 1), this.options.onIdleWorkerRemoved?.(e), this.fileSize === null && this.supplyFileSize(e.currentPos);
		for (let t of e.pendingSlices) t.resolve(null);
	}
	insertIntoCache(e) {
		if (this.options.maxCacheSize === 0) return;
		let t = O(this.cache, e.start, (e) => e.start) + 1;
		if (t > 0) {
			let n = this.cache[t - 1];
			if (n.end >= e.end) return;
			if (n.end > e.start) {
				let r = new Uint8Array(e.end - n.start);
				r.set(n.bytes, 0), r.set(e.bytes, e.start - n.start), this.currentCacheSize += e.end - n.end, n.bytes = r, n.view = c(r), n.end = e.end, t--, e = n;
			} else this.cache.splice(t, 0, e), this.currentCacheSize += e.bytes.length;
		} else this.cache.splice(t, 0, e), this.currentCacheSize += e.bytes.length;
		for (let n = t + 1; n < this.cache.length; n++) {
			let t = this.cache[n];
			if (e.end <= t.start) break;
			if (e.end >= t.end) {
				this.cache.splice(n, 1), this.currentCacheSize -= t.bytes.length, n--;
				continue;
			}
			let r = new Uint8Array(t.end - e.start);
			r.set(e.bytes, 0), r.set(t.bytes, t.start - e.start), this.currentCacheSize -= e.end - t.start, e.bytes = r, e.view = c(r), e.end = t.end, this.cache.splice(n, 1);
			break;
		}
		for (; this.currentCacheSize > this.options.maxCacheSize;) {
			let e = 0, t = this.cache[0];
			for (let n = 1; n < this.cache.length; n++) {
				let r = this.cache[n];
				r.age < t.age && (e = n, t = r);
			}
			if (this.currentCacheSize - t.bytes.length <= this.options.maxCacheSize) break;
			this.cache.splice(e, 1), this.currentCacheSize -= t.bytes.length;
		}
	}
	dispose() {
		for (let e of this.workers) {
			for (let t of e.pendingSlices) t.reject(new G());
			e.pendingSlices.length = 0, e.aborted = !0, e.running || this.options.onIdleWorkerRemoved?.(e);
		}
		for (let e of this.queuedReads) for (let t of e.pendingSlices) t.reject(new G());
		this.workers.length = 0, this.cache.length = 0, this.queuedReads.length = 0, this.disposed = !0;
	}
}, co = class extends Ja {
	constructor(e, t, n) {
		if (super(), this._ref = null, e._disposed) throw Error("Cannot create a slice of a disposed source.");
		this._baseSource = e, this._offset = t, this._length = n ?? null;
	}
	_getFileSize() {
		let e = this._baseSource._getFileSize();
		return e === void 0 ? this._length === null ? void 0 : this._length : e === null ? this._length === null ? null : this._length : le(e - this._offset, 0, this._length ?? Infinity);
	}
	_read(e, t, n, r) {
		if (this._length !== null && t > this._length) return null;
		let i = this._baseSource._read(this._offset + e, this._offset + t, this._offset + n, this._offset + r), a = (e) => e ? (e.offset -= this._offset, e) : null;
		return A(i) ? i.then(a) : a(i);
	}
	_dispose() {
		this._ref?.free();
	}
	ref() {
		return this._ref ??= this._baseSource.ref(), super.ref();
	}
}, lo = function(e, t, n) {
	if (t != null) {
		if (typeof t != "object" && typeof t != "function") throw TypeError("Object expected.");
		var r, i;
		if (n) {
			if (!Symbol.asyncDispose) throw TypeError("Symbol.asyncDispose is not defined.");
			r = t[Symbol.asyncDispose];
		}
		if (r === void 0) {
			if (!Symbol.dispose) throw TypeError("Symbol.dispose is not defined.");
			r = t[Symbol.dispose], n && (i = r);
		}
		if (typeof r != "function") throw TypeError("Object not disposable.");
		i && (r = function() {
			try {
				i.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		}), e.stack.push({
			value: t,
			dispose: r,
			async: n
		});
	} else n && e.stack.push({ async: !0 });
	return t;
}, uo = (function(e) {
	return function(t) {
		function n(n) {
			t.error = t.hasError ? new e(n, t.error, "An error was suppressed during disposal.") : n, t.hasError = !0;
		}
		var r, i = 0;
		function a() {
			for (; r = t.stack.pop();) try {
				if (!r.async && i === 1) return i = 0, t.stack.push(r), Promise.resolve().then(a);
				if (r.dispose) {
					var e = r.dispose.call(r.value);
					if (r.async) return i |= 2, Promise.resolve(e).then(a, function(e) {
						return n(e), a();
					});
				} else i |= 1;
			} catch (e) {
				n(e);
			}
			if (i === 1) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
			if (t.hasError) throw t.error;
		}
		return a();
	};
})(typeof SuppressedError == "function" ? SuppressedError : function(e, t, n) {
	var r = Error(n);
	return r.name = "SuppressedError", r.error = e, r.suppressed = t, r;
}), fo = /^0[xX][0-9a-fA-F]+$/, po = /^data:.*;base64,/i, mo = class extends Ua {
	constructor(e, t, n, r) {
		super(e.input, t, n), this.segments = [], this.nextLines = null, this.currentUpdateSegmentsPromise = null, this.streamHasEnded = !1, this.lastSegmentUpdateTime = -Infinity, this.refreshInterval = 5, this.rootPath = t, this.demuxer = e, this.nextLines = r;
	}
	runUpdateSegments() {
		return this.currentUpdateSegmentsPromise ??= (async () => {
			try {
				let e = this.getRemainingWaitTimeMs();
				e > 0 && await Ke(e), this.lastSegmentUpdateTime = performance.now(), await this.updateSegments();
			} finally {
				this.currentUpdateSegmentsPromise = null;
			}
		})();
	}
	getRemainingWaitTimeMs() {
		let e = performance.now() - this.lastSegmentUpdateTime, t = Math.max(0, 1e3 * this.refreshInterval - e);
		return t <= 50 ? 0 : t;
	}
	async updateSegments() {
		let e = this.nextLines;
		if (this.nextLines = null, !e) {
			let n = {
				stack: [],
				error: void 0,
				hasError: !1
			};
			try {
				let r = lo(n, await this.demuxer.input._getSourceUncached({
					path: this.rootPath,
					isRoot: !1
				}), !1), i = await new qs(r.source).requestEntireFile();
				t(i), e = sc(i, i.length, { ignore: Va }), r.source instanceof Xa && (this.rootPath = r.source.rootPath);
			} catch (e) {
				n.error = e, n.hasError = !0;
			} finally {
				uo(n);
			}
		}
		let n = this.input._formatOptions.hls?.offsetTimestampsByDateTime !== !1, i = !1, a = 0, o = null, s = null, l = null, u = 0, d = null, f = null, p = null, m = null, h = null, g = null, _ = !1, v = r(this.segments) ?? null, y = (e) => {
			let t = e.indexOf("@"), n = Number(t === -1 ? e : e.slice(0, t));
			if (!Number.isInteger(n) || n < 0) throw Error(`Invalid #EXT-X-BYTERANGE length '${e}'.`);
			let r = null;
			if (t !== -1 && (r = Number(e.slice(t + 1)), !Number.isInteger(r) || r < 0)) throw Error(`Invalid #EXT-X-BYTERANGE offset '${e}'.`);
			return {
				length: n,
				offset: r
			};
		}, b = (e) => {
			u = e, v && (t(v.sequenceNumber !== null), v.sequenceNumber < e && (a = v.timestamp + v.duration, d = v.firstSegment, f = v.initSegment, h = v.lastProgramDateTimeSeconds, o = v.unixEpochTimestamp === null ? null : v.unixEpochTimestamp + v.duration, v = null));
		};
		for (let t = 0; t < e.length; t++) {
			let x = e[t];
			if (!i) {
				if (x !== "#EXTM3U") throw Error("Invalid M3U8 file; expected first line to be #EXTM3U.");
				i = !0;
				continue;
			}
			if (!x.startsWith("#")) {
				if (!v) {
					if (s === null) throw Error("Invalid M3U8 file; a segment must be preceded by an #EXTINF tag.");
					let e = l;
					if (e && e.method === "AES-128" && !e.iv) {
						let t = /* @__PURE__ */ new Uint8Array(16), n = c(t);
						n.setUint32(8, Math.floor(u / 2 ** 32)), n.setUint32(12, u), e = {
							...e,
							iv: t
						};
					}
					let t = {
						path: Ve(this.rootPath, x),
						offset: m?.offset ?? 0,
						length: m?.length ?? null
					}, n = {
						timestamp: a,
						unixEpochTimestamp: o,
						firstSegment: d,
						sequenceNumber: u,
						location: t,
						duration: s,
						encryption: e,
						initSegment: f,
						lastProgramDateTimeSeconds: h
					};
					d ??= n, a += s, o !== null && (o += s), this.segments.push(n);
				}
				s = null, m === null ? p = null : m = null, b(u + 1);
			}
			if (x.startsWith("#EXTINF:")) {
				if (v) {
					_ = !0;
					continue;
				}
				_ ||= (h === null && u > 0 && g !== null && (a = u * g), !0);
				let e = x.slice(Pa.length), t = e.indexOf(","), n = t === -1 ? e : e.slice(0, t), r = Number(n);
				if (!Number.isFinite(r) || r < 0) throw Error(`Invalid #EXTINF tag duration '${n}'.`);
				s = r;
			} else if (x.startsWith("#EXT-X-MAP:")) {
				let e = new Ha(x.slice(Fa.length)), t = e.get("uri");
				if (!t) throw Error("Invalid #EXT-X-MAP tag; missing URI attribute.");
				let n = e.get("byterange"), r = null;
				if (n !== null && (r = y(n)), r && r.offset === null) throw Error("Invalid #EXT-X-MAP tag; BYTERANGE attribute must have a specified offset.");
				if (!v) {
					let e = {
						path: Ve(this.rootPath, t),
						offset: r?.offset ?? 0,
						length: r?.length ?? null
					};
					if (l?.method === "AES-128" && !l.iv) throw Error("IV attribute must be set on #EXT-X-KEY tag preceding the #EXT-X-MAP tag.");
					f = {
						timestamp: a,
						unixEpochTimestamp: o,
						firstSegment: null,
						sequenceNumber: null,
						location: e,
						duration: 0,
						encryption: l,
						initSegment: null,
						lastProgramDateTimeSeconds: h
					};
				}
				s = null, m === null ? p = null : m = null;
			} else if (x.startsWith("#EXT-X-KEY:")) {
				let e = new Ha(x.slice(Ia.length)), t = e.get("method");
				if (t === "NONE") l = null;
				else if (t === "AES-128") {
					let t = e.get("uri");
					if (!t) throw Error("Invalid #EXT-X-KEY: AES-128 requires a URI attribute.");
					let n = null, r = e.get("iv");
					if (r) {
						if (!fo.test(r)) throw Error(`Unsupported IV format '${r}'.`);
						let e = r.slice(2);
						e = e.padStart(32, "0"), n = /* @__PURE__ */ new Uint8Array(16);
						for (let t = 0; t < 16; t++) {
							let r = -32 + t;
							n[t] = parseInt(e.slice(r, r + 2), 16);
						}
					}
					let i = e.get("keyformat") ?? "identity";
					if (i !== "identity") throw Error("For AES-128 encryption, only the 'identity' KEYFORMAT is currently supported. If you think other formats should be supported, please raise an issue.");
					l = {
						method: "AES-128",
						keyUri: Ve(this.rootPath, t),
						iv: n,
						keyFormat: i
					};
				} else if (t === "SAMPLE-AES" || t === "SAMPLE-AES-CTR") {
					let n = e.get("uri");
					if (!n) throw Error(`Invalid #EXT-X-KEY: ${t} requires a URI attribute.`);
					if ((e.get("keyformat") ?? "identity") === "identity") throw Error("For SAMPLE-AES and SAMPLE-AES-CTR encryption, the 'identity' KEYFORMAT is not supported. If you think this format should be supported, please raise an issue.");
					let r = null;
					if (po.test(n)) {
						let e = n.indexOf(","), t = Le(n.slice(e + 1));
						if (t.length >= 8 && t[4] === 112 && t[5] === 115 && t[6] === 115 && t[7] === 104) {
							let e = c(t).getUint32(0);
							r = br(t.subarray(8, Math.min(e, t.length)));
						}
					}
					l = {
						method: t,
						psshBox: r
					};
				} else throw Error(`Unsupported encryption method '${t}'. If you think this method should be supported, please raise an issue.`);
			} else if (x.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
				let e = x.slice(La.length), t = Number(e);
				if (!Number.isInteger(t) || t < 0) throw Error(`Invalid EXT-X-MEDIA-SEQUENCE value '${e}'.`);
				b(t);
			} else if (x.startsWith("#EXT-X-BYTERANGE:")) {
				let e = y(x.slice(Ra.length));
				if (e.offset === null) {
					if (p === null) throw Error("Invalid M3U8 file; #EXT-X-BYTERANGE without offset requires a previous byte range.");
					e.offset = p;
				}
				m = e, p = e.offset + e.length;
			} else if (x.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
				if (v) continue;
				let e = x.slice(za.length), t = Date.parse(e);
				if (!Number.isFinite(t)) continue;
				let i = t / 1e3;
				if (h === i) continue;
				if (h === null && this.segments.length > 0) {
					let e = r(this.segments), t = i - (e.timestamp + e.duration);
					for (let e of this.segments) e.unixEpochTimestamp = e.timestamp + t, n && (e.timestamp = e.unixEpochTimestamp);
				}
				h = i, o = i, n && (a = i);
			} else if (x === "#EXT-X-DISCONTINUITY") d = null;
			else if (x.startsWith("#EXT-X-TARGETDURATION:")) {
				let e = x.slice(Ba.length), t = Number(e);
				if (!Number.isFinite(t) || t < 0) throw Error(`Invalid EXT-X-TARGETDURATION value '${e}'.`);
				this.refreshInterval = t, g = t;
			} else if (x === "#EXT-X-ENDLIST") {
				this.streamHasEnded = !0;
				break;
			} else x.startsWith("#EXT-X-PLAYLIST-TYPE:") && x.slice(21).toLowerCase() === "vod" && (this.streamHasEnded = !0);
		}
		if (!i) throw Error("Invalid M3U8 file; no #EXTM3U header.");
	}
	async getFirstSegment() {
		return this.segments.length === 0 && await this.runUpdateSegments(), this.segments[0] ?? null;
	}
	async getSegmentAt(e, t) {
		this.segments.length === 0 && await this.runUpdateSegments();
		let n = !!t.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
		for (;;) {
			let r = O(this.segments, e, (e) => e.timestamp);
			if (r === -1) return null;
			if (r < this.segments.length - 1 || this.streamHasEnded || n) return this.segments[r];
			let i = this.segments[r];
			if (e < i.timestamp + i.duration) return i;
			await this.runUpdateSegments(), t.skipLiveWait && (n = !0);
		}
	}
	async getNextSegment(e, n) {
		let r = this.segments.indexOf(e);
		t(r !== -1);
		let i = r + 1, a = !!n.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
		for (;;) {
			if (i < this.segments.length) return this.segments[i];
			if (this.streamHasEnded || a) return null;
			await this.runUpdateSegments(), n.skipLiveWait && (a = !0);
		}
	}
	async getPreviousSegment(e) {
		let n = this.segments.indexOf(e);
		return t(n !== -1), this.segments[n - 1] ?? null;
	}
	getInputForSegment(e) {
		let n = e, r = this.inputCache.find((e) => e.segment === n);
		if (r) return r.age = this.nextInputCacheAge++, r.input;
		let i = null;
		(n.initSegment || n.firstSegment) && (i = this.getInputForSegment(n.initSegment ?? n.firstSegment));
		let a = {
			...this.input._formatOptions,
			isobmff: {
				...this.input._formatOptions.isobmff,
				resolveKeyId: this.input._formatOptions.isobmff?.resolveKeyId && ((e) => {
					if (!n.encryption || n.encryption.method !== "SAMPLE-AES" && n.encryption.method !== "SAMPLE-AES-CTR" || !n.encryption.psshBox) return this.input._formatOptions.isobmff.resolveKeyId(e);
					let t = e.psshBoxes, { psshBox: r } = n.encryption;
					return (r.keyIds === null || r.keyIds.includes(e.keyId)) && !t.some((e) => xr(e, r)) && (t = [...t, r]), this.input._formatOptions.isobmff.resolveKeyId({
						...e,
						psshBoxes: t
					});
				})
			}
		}, o = new Gs({
			source: new Qa(n.location.path, async (e) => {
				t(e.isRoot);
				let r = {
					...e,
					isRoot: !1
				}, i, a = n.location.offset > 0 || n.location.length !== null;
				if (!n.encryption || n.encryption.method === "SAMPLE-AES" || n.encryption.method === "SAMPLE-AES-CTR") {
					if (i = await this.input._getSourceCached(r), a) {
						let e = i.source.slice(n.location.offset, n.location.length ?? void 0).ref();
						i.free(), i = e;
					}
				} else if (n.encryption.method === "AES-128") {
					let e = n.encryption;
					t(e.iv);
					let o = await this.input._getSourceCached(r);
					if (a) {
						let e = o.source.slice(n.location.offset, n.location.length ?? void 0).ref();
						o.free(), o = e;
					}
					i = new ao(Lr(new qs(o.source), async () => {
						let t = {
							stack: [],
							error: void 0,
							hasError: !1
						};
						try {
							let n = await new qs(lo(t, await this.input._getSourceCached({
								path: e.keyUri,
								isRoot: !1
							}, 2), !1).source).requestSlice(0, 16);
							if (!n) throw Error("Invalid AES-128 key; expected at least 16 bytes of data.");
							return {
								key: q(n, 16),
								iv: e.iv
							};
						} catch (e) {
							t.error = e, t.hasError = !0;
						} finally {
							uo(t);
						}
					}, () => {
						o.free();
					})).ref();
				} else t(!1);
				return i;
			}),
			formats: this.input._formats.filter((e) => !(e instanceof No)),
			initInput: i ?? void 0,
			formatOptions: a
		});
		if (o._onFormatDetermined = (e) => {
			if ((n.encryption?.method === "SAMPLE-AES" || n.encryption?.method === "SAMPLE-AES-CTR") && !e._isIsobmff) throw Error("The SAMPLE-AES and SAMPLE-AES-CTR encryption methods are currently only supported for ISOBMFF files.");
		}, this.inputCache.push({
			segment: n,
			input: o,
			age: this.nextInputCacheAge++
		}), this.inputCache.length > 4) {
			let e = Ue(this.inputCache, (e) => e.age);
			t(e !== -1), this.inputCache.splice(e, 1);
		}
		return o;
	}
	async getLiveRefreshInterval() {
		return this.getRemainingWaitTimeMs() === 0 && await this.runUpdateSegments(), this.streamHasEnded ? null : this.refreshInterval;
	}
}, ho = class extends vr {
	constructor(e) {
		super(e), this.metadataPromise = null, this.trackBackings = null, this.internalTracks = null, this.segmentedInputs = [], this.hasMasterPlaylist = !0;
	}
	readMetadata() {
		return this.metadataPromise ??= (async () => {
			t(this.input._rootSource instanceof Xa);
			let e = await this.input._reader.requestEntireFile();
			t(e);
			let n = sc(e, e.length, { ignore: Va }), { rootPath: r } = this.input._rootSource, i = [], a = [];
			for (let e = 1; e < n.length; e++) {
				let t = n[e];
				if (t.startsWith("#EXT-X-STREAM-INF:")) {
					let a = e, o = n[++e];
					if (o === void 0) throw Error("Incorrect M3U8 file; a line must follow the #EXT-X-STREAM-INF tag.");
					let s = Ve(r, o), c = new Ha(t.slice(ja.length));
					if (c.getAsNumber("bandwidth") === null) throw Error("Invalid M3U8 file; #EXT-X-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
					i.push({
						fullPath: s,
						attributes: c,
						lineNumber: a,
						hasOnlyKeyPackets: !1
					});
				} else if (t.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
					let n = new Ha(t.slice(Ma.length)), a = n.get("uri");
					if (a === null) throw Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a URI attribute.");
					if (n.getAsNumber("bandwidth") === null) throw Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
					let o = Ve(r, a);
					i.push({
						fullPath: o,
						attributes: n,
						lineNumber: e,
						hasOnlyKeyPackets: !0
					});
				} else if (t.startsWith("#EXT-X-MEDIA:")) {
					let n = new Ha(t.slice(Na.length));
					if (n.get("type") === null) throw Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a TYPE attribute.");
					if (n.get("group-id") === null) throw Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a GROUP-ID attribute.");
					let i = null, o = n.get("uri");
					o !== null && (i = Ve(r, o)), a.push({
						fullPath: i,
						attributes: n,
						lineNumber: e
					});
				} else if (t !== "#EXT-X-I-FRAMES-ONLY" && t.startsWith("#EXTINF:")) {
					let e = new mo(this, r, null, n);
					this.segmentedInputs = [e], this.hasMasterPlaylist = !1, this.trackBackings = await e.getTrackBackings();
					return;
				}
			}
			let o = [...new Set(a.filter((e) => e.attributes.get("type").toLowerCase() === "video").map((e) => e.attributes.get("group-id")))], s = [...new Set(a.filter((e) => e.attributes.get("type").toLowerCase() === "audio").map((e) => e.attributes.get("group-id")))], c = await Promise.all(i.map(async (e, n) => {
				let i = [], c = e.attributes.get("codecs"), l;
				if (c) l = c.split(",").map((e) => e.trim());
				else {
					let t = await this.getSegmentedInputForPath(e.fullPath).getTrackBackings(), n = await Promise.all(t.map(async (e) => ({
						track: e,
						codec: await e.getCodec()
					})));
					l = await Promise.all(n.filter((e) => e.codec !== null).map((e) => e.track.getDecoderConfig().then((e) => e.codec)));
				}
				let u = e.attributes.get("video"), d = e.attributes.get("audio"), f = l.some((e) => kn.includes(Qn(e))), p = l.some((e) => Mn.includes(Qn(e)));
				if (u !== null && !f) {
					if (!o.includes(u)) throw Error(`Invalid M3U8 file; variant stream references video group "${u}" which is not defined in any #EXT-X-MEDIA tags.`);
					let e = a.find((e) => {
						let t = e.attributes.get("group-id"), n = e.attributes.get("type");
						return t === u && n.toLowerCase() === "video";
					});
					outer: if (e) {
						let n = e.attributes.get("uri");
						if (n === null) break outer;
						let i = Ve(r, n), a = (await this.getSegmentedInputForPath(i).getTrackBackings()).find((e) => e.getType() === "video");
						if (!a || await a.getCodec() === null) break outer;
						let o = await a.getDecoderConfig().then((e) => e?.codec ?? null);
						t(o !== null), l.push(o);
					}
				}
				if (d !== null && !p) {
					if (!s.includes(d)) throw Error(`Invalid M3U8 file; variant stream references audio group "${d}" which is not defined in any #EXT-X-MEDIA tags.`);
					let e = a.find((e) => {
						let t = e.attributes.get("group-id"), n = e.attributes.get("type");
						return t === d && n.toLowerCase() === "audio";
					});
					outer: if (e) {
						let n = e.attributes.get("uri");
						if (n === null) break outer;
						let i = Ve(r, n), a = (await this.getSegmentedInputForPath(i).getTrackBackings()).find((e) => e.getType() === "audio");
						if (!a || await a.getCodec() === null) break outer;
						let o = await a.getDecoderConfig().then((e) => e?.codec ?? null);
						t(o !== null), l.push(o);
					}
				}
				l = [...new Set(l)];
				let m = null, h = null, g = e.attributes.getAsNumber("bandwidth");
				t(g !== null);
				let _ = e.attributes.getAsNumber("average-bandwidth"), v = e.attributes.get("name");
				for (let t of l) {
					let r = Qn(t);
					if (r !== null) {
						if (kn.includes(r)) {
							if (m !== null) throw Error("Unsupported M3U8 file; multiple video codecs found in the CODECS attribute of a variant stream.");
							m = t;
							let r = e.attributes.get("video");
							if (r === null) {
								let t = e.attributes.get("resolution"), r = null, a = null;
								if (t) {
									let e = t.match(/^(\d+)x(\d+)$/);
									e && (r = Number(e[1]), a = Number(e[2]));
								}
								i.push({
									id: -1,
									demuxer: this,
									backingTrack: null,
									default: !0,
									autoselect: !0,
									languageCode: "und",
									lineNumber: e.lineNumber,
									fullPath: e.fullPath,
									fullCodecString: m,
									pairingMask: 1n << BigInt(n),
									peakBitrate: g,
									averageBitrate: _,
									name: v,
									hasOnlyKeyPackets: e.hasOnlyKeyPackets,
									info: {
										type: "video",
										width: r,
										height: a
									}
								});
							} else {
								if (!o.includes(r)) throw Error(`Invalid M3U8 file; variant stream references video group "${r}" which is not defined in any #EXT-X-MEDIA tags.`);
								for (let t of a) {
									let a = t.attributes.get("group-id"), o = t.attributes.get("type");
									if (a !== r || o.toLowerCase() !== "video") continue;
									let s = t.attributes.get("resolution") ?? e.attributes.get("resolution"), c = null, l = null;
									if (s) {
										let e = s.match(/^(\d+)x(\d+)$/);
										e && (c = Number(e[1]), l = Number(e[2]));
									}
									i.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: yo(t.attributes),
										autoselect: yo(t.attributes) || bo(t.attributes),
										languageCode: xo(t.attributes.get("language")),
										lineNumber: t.lineNumber,
										fullPath: t.fullPath ?? e.fullPath,
										fullCodecString: m,
										pairingMask: 1n << BigInt(n),
										peakBitrate: null,
										averageBitrate: null,
										name: t.attributes.get("name"),
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "video",
											width: c,
											height: l
										}
									});
								}
							}
						} else if (Mn.includes(r)) {
							if (h !== null) throw Error("Unsupported M3U8 file; multiple audio codecs found in the CODECS attribute of a variant stream.");
							h = t;
							let r = e.attributes.get("audio");
							if (r === null) {
								let t = e.attributes.get("channels"), r = t === null ? null : Number(t.split("/")[0]);
								i.push({
									id: -1,
									demuxer: this,
									backingTrack: null,
									default: !0,
									autoselect: !0,
									languageCode: "und",
									lineNumber: e.lineNumber,
									fullPath: e.fullPath,
									fullCodecString: h,
									pairingMask: 1n << BigInt(n),
									peakBitrate: g,
									averageBitrate: _,
									name: v,
									hasOnlyKeyPackets: e.hasOnlyKeyPackets,
									info: {
										type: "audio",
										numberOfChannels: r !== null && Number.isInteger(r) && r > 0 ? r : null
									}
								});
							} else {
								if (!s.includes(r)) throw Error(`Invalid M3U8 file; variant stream references audio group "${r}" which is not defined in any #EXT-X-MEDIA tags.`);
								for (let t of a) {
									let a = t.attributes.get("group-id"), o = t.attributes.get("type");
									if (a !== r || o.toLowerCase() !== "audio") continue;
									let s = t.attributes.get("channels") ?? e.attributes.get("channels"), c = s === null ? null : Number(s.split("/")[0]);
									i.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: yo(t.attributes),
										autoselect: yo(t.attributes) || bo(t.attributes),
										languageCode: xo(t.attributes.get("language")),
										lineNumber: t.lineNumber,
										fullPath: t.fullPath ?? e.fullPath,
										fullCodecString: h,
										pairingMask: 1n << BigInt(n),
										peakBitrate: null,
										averageBitrate: null,
										name: t.attributes.get("name"),
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "audio",
											numberOfChannels: c !== null && Number.isInteger(c) && c > 0 ? c : null
										}
									});
								}
							}
						}
					}
				}
				return i;
			})), l = [], u = (e) => {
				let t = l.find((t) => t.fullPath === e.fullPath && t.info.type === e.info.type);
				t ? (t.pairingMask |= e.pairingMask, t.default ||= e.default, t.autoselect ||= e.autoselect, t.lineNumber = Math.min(t.lineNumber, e.lineNumber), e.peakBitrate !== null && (t.peakBitrate = Math.max(t.peakBitrate ?? -Infinity, e.peakBitrate)), e.averageBitrate !== null && (t.averageBitrate = Math.max(t.averageBitrate ?? -Infinity, e.averageBitrate)), t.languageCode === "und" && (t.languageCode = e.languageCode)) : (e.id = l.length + 1, l.push(e));
			};
			for (let e of c) for (let t of e) u(t);
			l.sort((e, t) => e.lineNumber - t.lineNumber), this.trackBackings = [];
			for (let e of l) e.info.type === "video" ? this.trackBackings.push(new _o(e)) : this.trackBackings.push(new vo(e));
			this.internalTracks = l;
		})();
	}
	async getTrackBackings() {
		return await this.readMetadata(), t(this.trackBackings), this.trackBackings;
	}
	getSegmentedInputForPath(e) {
		let t = this.segmentedInputs.find((t) => t.path === e);
		if (t) return t;
		let n = null;
		return this.internalTracks && (n = this.internalTracks.filter((t) => t.fullPath === e).map((e) => ({
			id: e.id,
			type: e.info.type
		}))), t = new mo(this, e, n, null), this.segmentedInputs.push(t), t;
	}
	async getMetadataTags() {
		return {};
	}
	async getMimeType() {
		return Aa;
	}
	dispose() {
		if (this.segmentedInputs) {
			for (let e of this.segmentedInputs) e.dispose();
			this.segmentedInputs.length = 0;
		}
	}
}, go = class {
	constructor(e) {
		this.internalTrack = e, this.hydrationPromise = null;
	}
	hydrate() {
		return this.hydrationPromise ??= (async () => {
			let e = this.internalTrack.demuxer.getSegmentedInputForPath(this.internalTrack.fullPath), n = null, r = (await e.getTrackBackings()).filter((e) => e.getType() === this.getType());
			if (r.length === 1) n = r[0];
			else if (this instanceof _o) {
				for (let e of r) if (await e.getCodec() === this.getCodec()) {
					n = e;
					break;
				}
			} else {
				t(this instanceof vo);
				for (let e of r) if (await e.getCodec() === this.getCodec()) {
					n = e;
					break;
				}
			}
			if (!n) throw Error("Could not find matching track in underlying media data.");
			this.internalTrack.backingTrack = n;
		})();
	}
	delegate(e) {
		return this.internalTrack.backingTrack ? e() : this.hydrate().then(e);
	}
	getCodec() {
		throw Error("Not implemented on base class.");
	}
	getDisposition() {
		return {
			...et,
			default: this.internalTrack.autoselect,
			primary: this.internalTrack.default
		};
	}
	getId() {
		return this.internalTrack.id;
	}
	getPairingMask() {
		return this.internalTrack.pairingMask;
	}
	getInternalCodecId() {
		return null;
	}
	getLanguageCode() {
		return this.internalTrack.languageCode;
	}
	getName() {
		return this.internalTrack.name;
	}
	getNumber() {
		t(this.internalTrack.demuxer.internalTracks);
		let e = this.internalTrack.info.type, n = 0;
		for (let t of this.internalTrack.demuxer.internalTracks) if (t.info.type === e && n++, t === this.internalTrack) break;
		return n;
	}
	getTimeResolution() {
		return this.delegate(() => this.internalTrack.backingTrack.getTimeResolution());
	}
	isRelativeToUnixEpoch() {
		return this.delegate(() => this.internalTrack.backingTrack.isRelativeToUnixEpoch());
	}
	getUnixTimeForTimestamp(e) {
		return this.delegate(() => this.internalTrack.backingTrack.getUnixTimeForTimestamp(e));
	}
	getBitrate() {
		return this.internalTrack.peakBitrate;
	}
	getAverageBitrate() {
		return this.internalTrack.averageBitrate;
	}
	async getDurationFromMetadata(e) {
		return await this.hydrate(), this.internalTrack.backingTrack.getDurationFromMetadata(e);
	}
	async getLiveRefreshInterval() {
		return await this.hydrate(), this.internalTrack.backingTrack.getLiveRefreshInterval();
	}
	getHasOnlyKeyPackets() {
		return this.internalTrack.hasOnlyKeyPackets || null;
	}
	async getFirstPacket(e) {
		return await this.hydrate(), this.internalTrack.backingTrack.getFirstPacket(e);
	}
	async getPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getPacket(e, t);
	}
	async getKeyPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getKeyPacket(e, t);
	}
	async getNextPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getNextPacket(e, t);
	}
	async getNextKeyPacket(e, t) {
		return await this.hydrate(), this.internalTrack.backingTrack.getNextKeyPacket(e, t);
	}
}, _o = class extends go {
	constructor(e) {
		super(e);
	}
	get backingVideoTrack() {
		return this.internalTrack.backingTrack;
	}
	getType() {
		return "video";
	}
	getCodec() {
		return Qn(this.internalTrack.fullCodecString);
	}
	getCodedWidth() {
		return this.delegate(() => this.backingVideoTrack.getCodedWidth());
	}
	getCodedHeight() {
		return this.delegate(() => this.backingVideoTrack.getCodedHeight());
	}
	getSquarePixelWidth() {
		return this.delegate(() => this.backingVideoTrack.getSquarePixelWidth());
	}
	getSquarePixelHeight() {
		return this.delegate(() => this.backingVideoTrack.getSquarePixelHeight());
	}
	getMetadataDisplayWidth() {
		return this.backingVideoTrack ? null : this.internalTrack.info.width;
	}
	getMetadataDisplayHeight() {
		return this.backingVideoTrack ? null : this.internalTrack.info.height;
	}
	getRotation() {
		return this.delegate(() => this.backingVideoTrack.getRotation());
	}
	async getColorSpace() {
		return await this.hydrate(), this.backingVideoTrack.getColorSpace();
	}
	async canBeTransparent() {
		return await this.hydrate(), this.backingVideoTrack.canBeTransparent();
	}
	getMetadataCodecParameterString() {
		return this.backingVideoTrack ? null : this.internalTrack.fullCodecString;
	}
	async getDecoderConfig() {
		return await this.hydrate(), this.backingVideoTrack.getDecoderConfig();
	}
}, vo = class extends go {
	constructor(e) {
		super(e);
	}
	get backingAudioTrack() {
		return this.internalTrack.backingTrack;
	}
	getType() {
		return "audio";
	}
	getCodec() {
		return Qn(this.internalTrack.fullCodecString);
	}
	getNumberOfChannels() {
		return this.internalTrack.info.numberOfChannels === null ? this.delegate(() => this.backingAudioTrack.getNumberOfChannels()) : this.internalTrack.info.numberOfChannels;
	}
	getSampleRate() {
		return this.delegate(() => this.backingAudioTrack.getSampleRate());
	}
	getMetadataCodecParameterString() {
		return this.backingAudioTrack ? null : this.internalTrack.fullCodecString;
	}
	async getDecoderConfig() {
		return await this.hydrate(), this.backingAudioTrack.getDecoderConfig();
	}
}, yo = (e) => {
	let t = e.get("default");
	if (t === null) return !1;
	let n = t.toUpperCase();
	if (n === "YES") return !0;
	if (n === "NO") return !1;
	throw Error(`Invalid M3U8 file; #EXT-X-MEDIA DEFAULT attribute must be YES or NO, got "${t}".`);
}, bo = (e) => {
	let t = e.get("autoselect");
	if (t === null) return !1;
	let n = t.toUpperCase();
	if (n === "YES") return !0;
	if (n === "NO") return !1;
	throw Error(`Invalid M3U8 file; #EXT-X-MEDIA AUTOSELECT attribute must be YES or NO, got "${t}".`);
}, xo = (e) => e === null ? "und" : e.split("-")[0] || "und", U = class {
	constructor() {
		this._isIsobmff = !1;
	}
}, So = class extends U {
	constructor() {
		super(...arguments), this._isIsobmff = !0;
	}
	async _getMajorBrand(e) {
		let t = e._reader.requestSlice(0, 12);
		if (A(t) && (t = await t), !t) return null;
		t.skip(4);
		let n = Q(t, 4);
		return n !== "ftyp" && n !== "styp" ? null : Q(t, 4);
	}
	_createDemuxer(e) {
		return new Rr(e);
	}
}, Co = class extends So {
	async _canReadInput(e) {
		let t = await this._getMajorBrand(e);
		if (t !== null) return t !== "qt  ";
		let n = 0;
		for (let t = 0; t < 10; t++) {
			let t = e._reader.requestSlice(n, 8);
			if (A(t) && (t = await t), !t) return !1;
			let r = X(t), i = 8;
			if (r === 1) {
				let t = e._reader.requestSlice(n + 8, 8);
				if (A(t) && (t = await t), !t) return !1;
				r = Z(t), i = 16;
			}
			if (r < i) return !1;
			let a = Q(t, 4);
			if (a === "moof" || a === "sidx") return !0;
			if (a === "emsg" || a === "prft" || a === "free") n += r;
			else return !1;
		}
		return !1;
	}
	get name() {
		return "MP4";
	}
	get mimeType() {
		return "video/mp4";
	}
}, wo = class extends So {
	async _canReadInput(e) {
		return await this._getMajorBrand(e) === "qt  ";
	}
	get name() {
		return "QuickTime File Format";
	}
	get mimeType() {
		return "video/quicktime";
	}
}, To = class extends U {
	async isSupportedEBMLOfDocType(e, t) {
		let n = e._reader.requestSlice(0, 16);
		if (A(n) && (n = await n), !n) return !1;
		let r = mi(n);
		if (r === null || r < 1 || r > 8 || B(n, r) !== z.EBML) return !1;
		let i = vi(n);
		if (typeof i != "number") return !1;
		let a = e._reader.requestSlice(n.filePos, i);
		if (A(a) && (a = await a), !a) return !1;
		let o = n.filePos;
		for (; a.filePos <= o + i - 2;) {
			let e = yi(a);
			if (!e) break;
			let { id: n, size: r } = e, i = a.filePos;
			if (r === void 0) return !1;
			switch (n) {
				case z.EBMLVersion:
					if (B(a, r) !== 1) return !1;
					break;
				case z.EBMLReadVersion:
					if (B(a, r) !== 1) return !1;
					break;
				case z.DocType:
					if (bi(a, r) !== t) return !1;
					break;
				case z.DocTypeVersion: if (B(a, r) > 4) return !1;
			}
			a.filePos = i + r;
		}
		return !0;
	}
	_canReadInput(e) {
		return this.isSupportedEBMLOfDocType(e, "matroska");
	}
	_createDemuxer(e) {
		return new Mi(e);
	}
	get name() {
		return "Matroska";
	}
	get mimeType() {
		return "video/x-matroska";
	}
}, Eo = class extends To {
	_canReadInput(e) {
		return this.isSupportedEBMLOfDocType(e, "webm");
	}
	get name() {
		return "WebM";
	}
	get mimeType() {
		return "video/webm";
	}
}, Do = class extends U {
	async _canReadInput(e) {
		let t = 0;
		for (;;) {
			let n = e._reader.requestSlice(t, 10);
			if (A(n) && (n = await n), !n) break;
			let r = pc(n);
			if (!r) break;
			t = n.filePos + r.size;
		}
		let n = await Ii(e._reader, t, t + 4096);
		if (!n) return !1;
		let r = n.header, i = pr(r.mpegVersionId, r.channel), a = e._reader.requestSlice(n.startPos + i, 4);
		if (A(a) && (a = await a), !a) return !1;
		let o = X(a);
		if (o === 1483304551 || o === 1231971951) return !0;
		t = n.startPos + n.header.totalSize;
		let s = await Ii(e._reader, t, t + 4);
		if (!s) return !1;
		let c = s.header;
		return r.channel === c.channel && r.sampleRate === c.sampleRate;
	}
	_createDemuxer(e) {
		return new Li(e);
	}
	get name() {
		return "MP3";
	}
	get mimeType() {
		return "audio/mpeg";
	}
}, Oo = class extends U {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 12);
		if (A(t) && (t = await t), !t) return !1;
		let n = Q(t, 4);
		return n !== "RIFF" && n !== "RIFX" && n !== "RF64" ? !1 : (t.skip(4), Q(t, 4) === "WAVE");
	}
	_createDemuxer(e) {
		return new Zi(e);
	}
	get name() {
		return "WAVE";
	}
	get mimeType() {
		return "audio/wav";
	}
}, ko = class extends U {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 4);
		return A(t) && (t = await t), t ? Q(t, 4) === "OggS" : !1;
	}
	_createDemuxer(e) {
		return new qi(e);
	}
	get name() {
		return "Ogg";
	}
	get mimeType() {
		return "application/ogg";
	}
}, Ao = class extends U {
	async _canReadInput(e) {
		let t = 0;
		for (;;) {
			let n = e._reader.requestSlice(t, 10);
			if (A(n) && (n = await n), !n) break;
			let r = pc(n);
			if (!r) break;
			t = n.filePos + r.size;
		}
		let n = e._reader.requestSlice(t, 4);
		return A(n) && (n = await n), n ? Q(n, 4) === "fLaC" : !1;
	}
	get name() {
		return "FLAC";
	}
	get mimeType() {
		return "audio/flac";
	}
	_createDemuxer(e) {
		return new ua(e);
	}
}, jo = class extends U {
	async _canReadInput(e) {
		let t = 0;
		for (;;) {
			let n = e._reader.requestSlice(t, 10);
			if (A(n) && (n = await n), !n) break;
			let r = pc(n);
			if (!r) break;
			t = n.filePos + r.size;
		}
		let n = e._reader.requestSliceRange(t, 7, 9);
		if (A(n) && (n = await n), !n) return !1;
		let r = ea(n);
		if (!r || (t += r.frameLength, n = e._reader.requestSliceRange(t, 7, 9), A(n) && (n = await n), !n)) return !1;
		let i = ea(n);
		return i ? r.objectType === i.objectType && r.samplingFrequencyIndex === i.samplingFrequencyIndex && r.channelConfiguration === i.channelConfiguration : !1;
	}
	_createDemuxer(e) {
		return new na(e);
	}
	get name() {
		return "ADTS";
	}
	get mimeType() {
		return "audio/aac";
	}
}, Mo = class extends U {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 205);
		if (A(t) && (t = await t), !t) return !1;
		let n = q(t, 205);
		return n[0] === 71 && n[188] === 71 || n[0] === 71 && n[204] === 71 || n[4] === 71 && n[196] === 71;
	}
	_createDemuxer(e) {
		return new xa(e);
	}
	get name() {
		return "MPEG Transport Stream";
	}
	get mimeType() {
		return "video/MP2T";
	}
}, No = class extends U {
	async _canReadInput(e) {
		let t = e._reader.requestSlice(0, 7);
		if (A(t) && (t = await t), !t || Q(t, 7) !== "#EXTM3U") return !1;
		if (!(e._rootSource instanceof Xa)) throw TypeError("HLS inputs require `InputOptions.source` to be a PathedSource or a ref to one.");
		return e._rootSource._usedForHls = !0, !0;
	}
	_createDemuxer(e) {
		return new ho(e);
	}
	get name() {
		return "HTTP Live Streaming (HLS)";
	}
	get mimeType() {
		return Aa;
	}
}, Po = [
	/* @__PURE__ */ new No(),
	/* @__PURE__ */ new Co(),
	/* @__PURE__ */ new wo(),
	/* @__PURE__ */ new To(),
	/* @__PURE__ */ new Eo(),
	/* @__PURE__ */ new Oo(),
	/* @__PURE__ */ new ko(),
	/* @__PURE__ */ new Ao(),
	/* @__PURE__ */ new Do(),
	/* @__PURE__ */ new jo(),
	/* @__PURE__ */ new Mo()
], Fo = (e, t) => {
	if (!e || typeof e != "object") throw TypeError(`${t}, when provided, must be an object.`);
	if (e.isobmff !== void 0) {
		if (!e.isobmff || typeof e.isobmff != "object") throw TypeError(`${t}.isobmff, when provided, must be an object.`);
		if (e.isobmff.resolveKeyId !== void 0 && typeof e.isobmff.resolveKeyId != "function") throw TypeError(`${t}.isobmff.resolveKeyId, when provided, must be a function.`);
	}
	if (e.hls !== void 0) {
		if (!e.hls || typeof e.hls != "object") throw TypeError(`${t}.hls, when provided, must be an object.`);
		if (e.hls.offsetTimestampsByDateTime !== void 0 && typeof e.hls.offsetTimestampsByDateTime != "boolean") throw TypeError(`${t}.hls.offsetTimestampsByDateTime, when provided, must be a boolean.`);
	}
}, Io = function(e, t, n) {
	if (t != null) {
		if (typeof t != "object" && typeof t != "function") throw TypeError("Object expected.");
		var r, i;
		if (n) {
			if (!Symbol.asyncDispose) throw TypeError("Symbol.asyncDispose is not defined.");
			r = t[Symbol.asyncDispose];
		}
		if (r === void 0) {
			if (!Symbol.dispose) throw TypeError("Symbol.dispose is not defined.");
			r = t[Symbol.dispose], n && (i = r);
		}
		if (typeof r != "function") throw TypeError("Object not disposable.");
		i && (r = function() {
			try {
				i.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		}), e.stack.push({
			value: t,
			dispose: r,
			async: n
		});
	} else n && e.stack.push({ async: !0 });
	return t;
}, Lo = (function(e) {
	return function(t) {
		function n(n) {
			t.error = t.hasError ? new e(n, t.error, "An error was suppressed during disposal.") : n, t.hasError = !0;
		}
		var r, i = 0;
		function a() {
			for (; r = t.stack.pop();) try {
				if (!r.async && i === 1) return i = 0, t.stack.push(r), Promise.resolve().then(a);
				if (r.dispose) {
					var e = r.dispose.call(r.value);
					if (r.async) return i |= 2, Promise.resolve(e).then(a, function(e) {
						return n(e), a();
					});
				} else i |= 1;
			} catch (e) {
				n(e);
			}
			if (i === 1) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
			if (t.hasError) throw t.error;
		}
		return a();
	};
})(typeof SuppressedError == "function" ? SuppressedError : function(e, t, n) {
	var r = Error(n);
	return r.name = "SuppressedError", r.error = e, r.suppressed = t, r;
});
ze();
var Ro = -Infinity, zo = -Infinity, Bo = null;
typeof FinalizationRegistry < "u" && (Bo = new FinalizationRegistry((e) => {
	let t = performance.now();
	e.type === "video" ? (t - Ro >= 1e3 && (j._error("A VideoSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your VideoSamples as soon as you're done using them."), Ro = t), typeof VideoFrame < "u" && e.data instanceof VideoFrame && e.data.close()) : (t - zo >= 1e3 && (j._error("An AudioSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your AudioSamples as soon as you're done using them."), zo = t), typeof AudioData < "u" && e.data instanceof AudioData && e.data.close());
}));
var Vo = class {
	constructor() {
		this._referenceCount = 0, this._lastAllocationBuffer = null;
	}
}, Ho = [
	"I420",
	"I420P10",
	"I420P12",
	"I420A",
	"I420AP10",
	"I420AP12",
	"I422",
	"I422P10",
	"I422P12",
	"I422A",
	"I422AP10",
	"I422AP12",
	"I444",
	"I444P10",
	"I444P12",
	"I444A",
	"I444AP10",
	"I444AP12",
	"NV12",
	"RGBA",
	"RGBX",
	"BGRA",
	"BGRX"
], Uo = new Set(Ho), Wo = class e {
	get codedWidth() {
		return this.visibleRect.width;
	}
	get codedHeight() {
		return this.visibleRect.height;
	}
	get displayWidth() {
		return this.rotation % 180 == 0 ? this.squarePixelWidth : this.squarePixelHeight;
	}
	get displayHeight() {
		return this.rotation % 180 == 0 ? this.squarePixelHeight : this.squarePixelWidth;
	}
	get microsecondTimestamp() {
		return Math.trunc(be * this.timestamp);
	}
	get microsecondDuration() {
		return Math.trunc(be * this.duration);
	}
	get hasAlpha() {
		return this.format && this.format.includes("A");
	}
	constructor(t, n) {
		if (this._closed = !1, t instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && t instanceof SharedArrayBuffer || ArrayBuffer.isView(t)) {
			if (!n || typeof n != "object") throw TypeError("init must be an object.");
			if (n.format === void 0 || !Uo.has(n.format)) throw TypeError("init.format must be one of: " + Ho.join(", "));
			if (!Number.isInteger(n.codedWidth) || n.codedWidth <= 0) throw TypeError("init.codedWidth must be a positive integer.");
			if (!Number.isInteger(n.codedHeight) || n.codedHeight <= 0) throw TypeError("init.codedHeight must be a positive integer.");
			if (n.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (!Number.isFinite(n.timestamp)) throw TypeError("init.timestamp must be a number.");
			if (n.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			if (n.layout !== void 0) {
				if (!Array.isArray(n.layout)) throw TypeError("init.layout, when provided, must be an array.");
				for (let e of n.layout) {
					if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError("Each entry in init.layout must be an object.");
					if (!Number.isInteger(e.offset) || e.offset < 0) throw TypeError("plane.offset must be a non-negative integer.");
					if (!Number.isInteger(e.stride) || e.stride < 0) throw TypeError("plane.stride must be a non-negative integer.");
				}
			}
			if (n.visibleRect !== void 0 && Ge(n.visibleRect, "init.visibleRect"), n.displayWidth !== void 0 && (!Number.isInteger(n.displayWidth) || n.displayWidth <= 0)) throw TypeError("init.displayWidth, when provided, must be a positive integer.");
			if (n.displayHeight !== void 0 && (!Number.isInteger(n.displayHeight) || n.displayHeight <= 0)) throw TypeError("init.displayHeight, when provided, must be a positive integer.");
			if (n.displayWidth !== void 0 != (n.displayHeight !== void 0)) throw TypeError("init.displayWidth and init.displayHeight must be either both provided or both omitted.");
			this.format = n.format, this.rotation = n.rotation ?? 0, this.timestamp = n.timestamp, this.duration = n.duration ?? 0;
			let e = n.layout ?? ts(n.format, n.codedWidth, n.codedHeight), r = n.colorSpace ?? null;
			r === null && (r = this.format === "RGBA" || this.format === "RGBX" || this.format === "BGRA" || this.format === "BGRX" ? {
				primaries: "bt709",
				transfer: "iec61966-2-1",
				matrix: "rgb",
				fullRange: !0
			} : {
				primaries: "bt709",
				transfer: "bt709",
				matrix: "bt709",
				fullRange: !1
			}), this.visibleRect = {
				left: n.visibleRect?.left ?? 0,
				top: n.visibleRect?.top ?? 0,
				width: n.visibleRect?.width ?? n.codedWidth,
				height: n.visibleRect?.height ?? n.codedHeight
			}, n.displayWidth === void 0 ? (this.squarePixelWidth = this.visibleRect.width, this.squarePixelHeight = this.visibleRect.height) : (this.squarePixelWidth = this.rotation % 180 == 0 ? n.displayWidth : n.displayHeight, this.squarePixelHeight = this.rotation % 180 == 0 ? n.displayHeight : n.displayWidth), this._data = n._doNotCopy ? s(t) : s(t).slice(), this._layout = e, this.colorSpace = new Xo(r);
		} else if (typeof VideoFrame < "u" && t instanceof VideoFrame) {
			if (n?.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (n?.timestamp !== void 0 && !Number.isFinite(n?.timestamp)) throw TypeError("init.timestamp, when provided, must be a number.");
			if (n?.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			n?.visibleRect !== void 0 && Ge(n.visibleRect, "init.visibleRect"), this._data = t, this._layout = null, this.format = t.format, this.visibleRect = {
				left: t.visibleRect?.x ?? 0,
				top: t.visibleRect?.y ?? 0,
				width: t.visibleRect?.width ?? t.codedWidth,
				height: t.visibleRect?.height ?? t.codedHeight
			}, this.rotation = n?.rotation ?? 0, this.squarePixelWidth = t.displayWidth, this.squarePixelHeight = t.displayHeight, this.timestamp = n?.timestamp ?? t.timestamp / 1e6, this.duration = n?.duration ?? (t.duration ?? 0) / 1e6, this.colorSpace = new Xo(t.colorSpace);
		} else if (typeof HTMLImageElement < "u" && t instanceof HTMLImageElement || typeof SVGImageElement < "u" && t instanceof SVGImageElement || typeof ImageBitmap < "u" && t instanceof ImageBitmap || typeof HTMLVideoElement < "u" && t instanceof HTMLVideoElement || typeof HTMLCanvasElement < "u" && t instanceof HTMLCanvasElement || typeof OffscreenCanvas < "u" && t instanceof OffscreenCanvas) {
			if (!n || typeof n != "object") throw TypeError("init must be an object.");
			if (n.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (!Number.isFinite(n.timestamp)) throw TypeError("init.timestamp must be a number.");
			if (n.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			if (n.visibleRect !== void 0 && Ge(n.visibleRect, "init.visibleRect"), typeof VideoFrame < "u") return new e(new VideoFrame(t, {
				timestamp: Math.trunc(n.timestamp * be),
				duration: Math.trunc((n.duration ?? 0) * be) || void 0,
				visibleRect: n.visibleRect && {
					x: n.visibleRect.left,
					y: n.visibleRect.top,
					width: n.visibleRect.width,
					height: n.visibleRect.height
				}
			}), n);
			let r = 0, i = 0;
			if ("naturalWidth" in t ? (r = t.naturalWidth, i = t.naturalHeight) : "videoWidth" in t ? (r = t.videoWidth, i = t.videoHeight) : "width" in t && (r = Number(t.width), i = Number(t.height)), !r || !i) throw TypeError("Could not determine dimensions.");
			let a = n.visibleRect ?? {
				left: 0,
				top: 0,
				width: r,
				height: i
			}, o = new OffscreenCanvas(a.width, a.height), s = o.getContext("2d", {
				alpha: Oe(),
				willReadFrequently: !0
			});
			if (!s) throw Error("OffscreenCanvas must have support for the '2d' context in order to create a VideoSample from this data.");
			s.drawImage(t, -a.left, -a.top), this._data = o, this._layout = null, this.format = "RGBX", this.visibleRect = {
				left: 0,
				top: 0,
				width: a.width,
				height: a.height
			}, this.squarePixelWidth = a.width, this.squarePixelHeight = a.height, this.rotation = n.rotation ?? 0, this.timestamp = n.timestamp, this.duration = n.duration ?? 0, this.colorSpace = new Xo({
				matrix: "rgb",
				primaries: "bt709",
				transfer: "iec61966-2-1",
				fullRange: !0
			});
		} else if (t instanceof Vo) {
			if (!n || typeof n != "object") throw TypeError("init must be an object.");
			if (n.rotation !== void 0 && ![
				0,
				90,
				180,
				270
			].includes(n.rotation)) throw TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
			if (!Number.isFinite(n.timestamp)) throw TypeError("init.timestamp must be a number.");
			if (n.duration !== void 0 && (!Number.isFinite(n.duration) || n.duration < 0)) throw TypeError("init.duration, when provided, must be a non-negative number.");
			if (this._data = t, t._referenceCount++, this.format = t.getFormat(), this.format !== null && !Ho.includes(this.format)) throw TypeError("getFormat() must return a VideoSamplePixelFormat or null.");
			if (this.visibleRect = {
				left: 0,
				top: 0,
				width: t.getCodedWidth(),
				height: t.getCodedHeight()
			}, !Number.isInteger(this.visibleRect.width) || this.visibleRect.width <= 0) throw TypeError("getCodedWidth() must return a positive integer.");
			if (!Number.isInteger(this.visibleRect.height) || this.visibleRect.height <= 0) throw TypeError("getCodedHeight() must return a positive integer.");
			if (this.squarePixelWidth = t.getSquarePixelWidth(), !Number.isInteger(this.squarePixelWidth) || this.squarePixelWidth <= 0) throw TypeError("getSquarePixelWidth() must return a positive integer.");
			if (this.squarePixelHeight = t.getSquarePixelHeight(), !Number.isInteger(this.squarePixelHeight) || this.squarePixelHeight <= 0) throw TypeError("getSquarePixelHeight() must return a positive integer.");
			this.rotation = n.rotation ?? 0, this.timestamp = n.timestamp, this.duration = n.duration ?? 0, this.colorSpace = t.getColorSpace();
		} else throw TypeError("Invalid data type: Must be a BufferSource, CanvasImageSource, or VideoSampleResource.");
		this.encodeOptions = n?.encodeOptions ?? {}, this.pixelAspectRatio = We({
			num: this.squarePixelWidth * this.codedHeight,
			den: this.squarePixelHeight * this.codedWidth
		}), Bo?.register(this, {
			type: "video",
			data: this._data
		}, this);
	}
	clone() {
		if (this._closed) throw Error("VideoSample is closed.");
		return t(this._data !== null), this._data instanceof Vo ? new e(this._data, {
			timestamp: this.timestamp,
			duration: this.duration,
			rotation: this.rotation,
			encodeOptions: this.encodeOptions
		}) : Zo(this._data) ? new e(this._data.clone(), {
			timestamp: this.timestamp,
			duration: this.duration,
			rotation: this.rotation,
			encodeOptions: this.encodeOptions
		}) : this._data instanceof Uint8Array ? (t(this._layout), new e(this._data, {
			format: this.format,
			layout: this._layout,
			codedWidth: this.codedWidth,
			codedHeight: this.codedHeight,
			timestamp: this.timestamp,
			duration: this.duration,
			colorSpace: this.colorSpace,
			rotation: this.rotation,
			visibleRect: this.visibleRect,
			displayWidth: this.displayWidth,
			displayHeight: this.displayHeight,
			encodeOptions: this.encodeOptions,
			_doNotCopy: !0
		})) : new e(this._data, {
			format: this.format,
			codedWidth: this.codedWidth,
			codedHeight: this.codedHeight,
			timestamp: this.timestamp,
			duration: this.duration,
			colorSpace: this.colorSpace,
			rotation: this.rotation,
			visibleRect: this.visibleRect,
			displayWidth: this.displayWidth,
			displayHeight: this.displayHeight,
			encodeOptions: this.encodeOptions
		});
	}
	close() {
		this._closed ||= (Bo?.unregister(this), this._data instanceof Vo ? (this._data._referenceCount--, this._data._referenceCount === 0 && this._data.close()) : Zo(this._data) ? this._data.close() : this._data = null, !0);
	}
	allocationSize(e = {}) {
		if (es(e), this._closed) throw Error("VideoSample is closed.");
		if ((e.format ?? this.format) == null) throw Error("Cannot get allocation size when format is null.");
		return Zo(this._data) ? this._data.allocationSize(e) : rs(this, e).allocationSize;
	}
	async copyTo(n, r = {}) {
		if (!x(n)) throw TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
		if (es(r), this._closed) throw Error("VideoSample is closed.");
		if ((r.format ?? this.format) == null) throw Error("Cannot copy video sample data when format is null.");
		if (t(this._data !== null), Zo(this._data)) return this._data.copyTo(n, r);
		if (r.format && ![
			"RGBA",
			"RGBX",
			"BGRA",
			"BGRX"
		].includes(this.format) && [
			"RGBA",
			"RGBX",
			"BGRA",
			"BGRX"
		].includes(r.format)) {
			if (this._data instanceof Vo) {
				let t = {
					stack: [],
					error: void 0,
					hasError: !1
				};
				try {
					let i = Io(t, await this._data.toRgbSample({
						timestamp: this.timestamp,
						duration: this.duration,
						rotation: this.rotation
					}, r.colorSpace ?? "srgb"), !1);
					if (!(i instanceof e)) throw TypeError("toRgbSample() must return a VideoSample.");
					if (![
						"RGBA",
						"RGBX",
						"BGRA",
						"BGRX"
					].includes(i.format)) throw Error(`Sample returned by toRgbSample was expected to have an RGB format, got '${i.format}' instead.`);
					return await i.copyTo(n, r);
				} catch (e) {
					t.error = e, t.hasError = !0;
				} finally {
					Lo(t);
				}
			} else {
				if (typeof VideoFrame > "u") throw Error("For this sample, converting from a non-RGB to an RGB format requires VideoFrame to be defined.");
				let e = this.toVideoFrame(), t = await e.copyTo(n, r);
				return e.close(), t;
			}
		}
		let i = rs(this, r);
		t(this.format);
		let a = s(n);
		if (a.byteLength < i.allocationSize) throw TypeError(`Destination buffer too small. Required: ${i.allocationSize}, Available: ${a.byteLength}`);
		let o = ns(this.format), c;
		if (this._data instanceof Vo) {
			let e = this._data.getDataPlanes();
			if (A(e) && (e = await e), !Array.isArray(e) || e.some((e) => !(e.data instanceof Uint8Array) || !Number.isInteger(e.stride) || e.stride < 0)) throw TypeError("getDataPlanes() must return an array of objects with a Uint8Array \"data\" property and a non-negative integer \"stride\" property.");
			c = e;
		} else if (this._data instanceof Uint8Array) t(this._layout), t(this._layout.length === o.length), c = this._layout.map((e, t) => {
			let n = Math.ceil(this.codedHeight / o[t].heightDivisor);
			return {
				data: this._data.subarray(e.offset, e.offset + e.stride * n),
				stride: e.stride
			};
		});
		else {
			let e = this._data.getContext("2d");
			t(e), c = [{
				data: s(e.getImageData(0, 0, this.codedWidth, this.codedHeight).data),
				stride: 4 * this.codedWidth
			}];
		}
		let l = [], u = o.length;
		for (let e = 0; e < u; e++) {
			let t = i.computedLayouts[e], n = c[e].stride, r = c[e].data, o = t.sourceTop * n;
			o += t.sourceLeftBytes;
			let s = t.destinationOffset, u = t.sourceWidthBytes, d = {
				offset: s,
				stride: t.destinationStride
			};
			for (let e = 0; e < t.sourceHeight; e++) {
				if (o + u > r.byteLength) throw Error("Source buffer OOB read.");
				if (s + u > a.byteLength) throw Error("Destination buffer OOB write.");
				let e = r.subarray(o, o + u);
				a.set(e, s), o += n, s += t.destinationStride;
			}
			l.push(d);
		}
		if (r.format !== void 0) {
			let e = this.format.startsWith("RGB") !== r.format.startsWith("RGB"), t = this.format.includes("X") && r.format.includes("A");
			if (e || t) for (let n = 0; n < i.allocationSize; n += 4) {
				if (e) {
					let e = a[n], t = a[n + 2];
					a[n] = t, a[n + 2] = e;
				}
				t && (a[n + 3] = 255);
			}
		}
		return l;
	}
	toVideoFrame() {
		if (this._closed) throw Error("VideoSample is closed.");
		if (t(this._data !== null), this._data instanceof Vo) {
			if (this.format === null) throw Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if format is null.");
			let e = this._data.getDataPlanes();
			if (A(e)) throw Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if getDataPlanes() returns a promise.");
			let t = e.reduce((e, t) => e + t.data.byteLength, 0), n = new Uint8Array(t), r = 0, i = [];
			for (let t of e) n.set(t.data, r), i.push(r), r += t.data.byteLength;
			return new VideoFrame(n, {
				format: this.format,
				layout: e.map((e, t) => ({
					offset: i[t],
					stride: e.stride
				})),
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration,
				colorSpace: this.colorSpace,
				visibleRect: this.visibleRect,
				displayWidth: this.squarePixelWidth,
				displayHeight: this.squarePixelHeight
			});
		}
		return Zo(this._data) ? new VideoFrame(this._data, {
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration || void 0
		}) : this._data instanceof Uint8Array ? (t(this._layout), new VideoFrame(this._data, {
			format: this.format,
			codedWidth: this.codedWidth,
			codedHeight: this.codedHeight,
			layout: this._layout,
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration || void 0,
			colorSpace: this.colorSpace,
			visibleRect: this.visibleRect,
			displayWidth: this.squarePixelWidth,
			displayHeight: this.squarePixelHeight
		})) : new VideoFrame(this._data, {
			timestamp: this.microsecondTimestamp,
			duration: this.microsecondDuration || void 0
		});
	}
	draw(e, t, n, r, i, a, o, s, c) {
		let l = 0, u = 0, d = this.displayWidth, f = this.displayHeight, p = 0, m = 0, h = this.displayWidth, g = this.displayHeight;
		if (a === void 0 ? (p = t, m = n, r !== void 0 && (h = r, g = i)) : (l = t, u = n, d = r, f = i, p = a, m = o, s === void 0 ? (h = d, g = f) : (h = s, g = c)), !(typeof CanvasRenderingContext2D < "u" && e instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D < "u" && e instanceof OffscreenCanvasRenderingContext2D)) throw TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
		if (!Number.isFinite(l)) throw TypeError("sx must be a number.");
		if (!Number.isFinite(u)) throw TypeError("sy must be a number.");
		if (!Number.isFinite(d) || d < 0) throw TypeError("sWidth must be a non-negative number.");
		if (!Number.isFinite(f) || f < 0) throw TypeError("sHeight must be a non-negative number.");
		if (!Number.isFinite(p)) throw TypeError("dx must be a number.");
		if (!Number.isFinite(m)) throw TypeError("dy must be a number.");
		if (!Number.isFinite(h) || h < 0) throw TypeError("dWidth must be a non-negative number.");
		if (!Number.isFinite(g) || g < 0) throw TypeError("dHeight must be a non-negative number.");
		if (this._closed) throw Error("VideoSample is closed.");
		({sx: l, sy: u, sWidth: d, sHeight: f} = this._rotateSourceRegion(l, u, d, f, this.rotation));
		let _ = this.toCanvasImageSource();
		e.save();
		let v = p + h / 2, y = m + g / 2;
		e.translate(v, y), e.rotate(this.rotation * Math.PI / 180);
		let b = this.rotation % 180 == 0 ? 1 : h / g;
		e.scale(1 / b, b), e.drawImage(_, l, u, d, f, -h / 2, -g / 2, h, g), e.restore();
	}
	drawWithFit(e, t) {
		if (!(typeof CanvasRenderingContext2D < "u" && e instanceof CanvasRenderingContext2D || typeof OffscreenCanvasRenderingContext2D < "u" && e instanceof OffscreenCanvasRenderingContext2D)) throw TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (![
			"fill",
			"contain",
			"cover"
		].includes(t.fit)) throw TypeError("options.fit must be 'fill', 'contain', or 'cover'.");
		if (t.rotation !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotation)) throw TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");
		t.crop !== void 0 && $o(t.crop, "options.");
		let n = e.canvas.width, r = e.canvas.height, i = t.rotation ?? this.rotation, [a, o] = i % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], s = t.crop;
		s &&= Qo(s, a, o);
		let c, l, u, d, { sx: f, sy: p, sWidth: m, sHeight: h } = this._rotateSourceRegion(t.crop?.left ?? 0, t.crop?.top ?? 0, t.crop?.width ?? a, t.crop?.height ?? o, i);
		if (t.fit === "fill") c = 0, l = 0, u = n, d = r;
		else {
			let [e, i] = t.crop ? [t.crop.width, t.crop.height] : [a, o], s = t.fit === "contain" ? Math.min(n / e, r / i) : Math.max(n / e, r / i);
			u = e * s, d = i * s, c = (n - u) / 2, l = (r - d) / 2;
		}
		e.save();
		let g = i % 180 == 0 ? 1 : u / d;
		e.translate(n / 2, r / 2), e.rotate(i * Math.PI / 180), e.scale(1 / g, g), e.translate(-n / 2, -r / 2), e.drawImage(this.toCanvasImageSource(), f, p, m, h, c, l, u, d), e.restore();
	}
	_rotateSourceRegion(e, t, n, r, i) {
		return i === 90 ? [e, t, n, r] = [
			t,
			this.squarePixelHeight - e - n,
			r,
			n
		] : i === 180 ? [e, t] = [this.squarePixelWidth - e - n, this.squarePixelHeight - t - r] : i === 270 && ([e, t, n, r] = [
			this.squarePixelWidth - t - r,
			e,
			r,
			n
		]), {
			sx: e,
			sy: t,
			sWidth: n,
			sHeight: r
		};
	}
	_drawWithFitAndMipmapping(e, t, n) {
		let r = e.width, i = e.height, [a, o] = n.rotation % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], s = n.crop ? n.crop.width : a, c = n.crop ? n.crop.height : o, l = 0;
		2 * r < s && 2 * i < c && (l = Math.floor(Math.log2(Math.min(s / r, c / i))));
		let u = r * 2 ** l, d = i * 2 ** l, { canvas: f, context: p, isNew: m } = l > 0 ? Yo(u, d) : {
			canvas: e,
			context: t,
			isNew: n.targetIsFresh
		};
		p.imageSmoothingQuality = "high", n.fillBlack ? (p.fillStyle = "black", p.fillRect(0, 0, u, d)) : m || p.clearRect(0, 0, u, d), this.drawWithFit(p, {
			fit: n.fit,
			rotation: n.rotation,
			crop: n.crop
		}), p.globalCompositeOperation = "copy";
		for (let e = l; e > 1; e--) {
			let t = r * 2 ** e, n = i * 2 ** e;
			p.drawImage(f, 0, 0, t, n, 0, 0, t / 2, n / 2);
		}
		p.globalCompositeOperation = "source-over", l > 0 && (t.imageSmoothingQuality = "high", t.globalCompositeOperation = "copy", t.drawImage(f, 0, 0, 2 * r, 2 * i, 0, 0, r, i), t.globalCompositeOperation = "source-over");
	}
	toCanvasImageSource() {
		if (this._closed) throw Error("VideoSample is closed.");
		if (t(this._data !== null), this._data instanceof Vo || this._data instanceof Uint8Array) {
			let e = this.toVideoFrame();
			return queueMicrotask(() => e.close()), e;
		}
		return this._data;
	}
	async transform(t) {
		if (!t || typeof t != "object") throw TypeError("options must be an object.");
		if (t.width !== void 0 && (!Number.isInteger(t.width) || t.width <= 0)) throw TypeError("options.width, when provided, must be a positive integer.");
		if (t.height !== void 0 && (!Number.isInteger(t.height) || t.height <= 0)) throw TypeError("options.height, when provided, must be a positive integer.");
		if (t.roundDimensionsTo !== void 0 && (!Number.isInteger(t.roundDimensionsTo) || t.roundDimensionsTo <= 0)) throw TypeError("options.roundDimensionsTo, when provided, must be a positive integer.");
		if (t.fit !== void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(t.fit)) throw TypeError("options.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
		if (t.width !== void 0 && t.height !== void 0 && t.fit === void 0) throw TypeError("When both options.width and options.height are provided, options.fit must also be provided.");
		if (t.rotate !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotate)) throw TypeError("options.rotate, when provided, must be 0, 90, 180 or 270.");
		if (t.crop !== void 0 && $o(t.crop, "options."), t.alpha !== void 0 && !["keep", "discard"].includes(t.alpha)) throw TypeError("options.alpha, when provided, must be 'keep' or 'discard'.");
		let r = n(this.rotation + (t.rotate ?? 0)), [i, a] = r % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], o = t.crop;
		o &&= Qo(o, i, a);
		let s = o ? o.width : i, c = o ? o.height : a, l = s / c, u, d;
		t.width !== void 0 && t.height === void 0 ? (u = t.width, d = u / l) : t.width === void 0 && t.height !== void 0 ? (d = t.height, u = d * l) : t.width !== void 0 && t.height !== void 0 ? (u = t.width, d = t.height) : (u = s, d = c), u = fe(u, t.roundDimensionsTo ?? 1), d = fe(d, t.roundDimensionsTo ?? 1);
		let f = {
			width: u,
			height: d,
			fit: t.fit ?? "fill",
			rotation: r,
			crop: o ?? {
				left: 0,
				top: 0,
				width: i,
				height: a
			},
			alpha: t.alpha ?? "keep"
		};
		for (let e of Go) {
			let t = e(this, f);
			if (A(t) && (t = await t), t !== null) return t;
		}
		let { canvas: p, context: m, isNew: h } = Yo(f.width, f.height);
		return this._drawWithFitAndMipmapping(p, m, {
			fit: f.fit,
			rotation: f.rotation,
			crop: f.crop,
			targetIsFresh: h,
			fillBlack: f.alpha === "discard"
		}), new e(p, {
			timestamp: this.timestamp,
			duration: this.duration,
			rotation: 0
		});
	}
	setRotation(e) {
		if (![
			0,
			90,
			180,
			270
		].includes(e)) throw TypeError("newRotation must be 0, 90, 180, or 270.");
		this.rotation = e;
	}
	setTimestamp(e) {
		if (!Number.isFinite(e)) throw TypeError("newTimestamp must be a number.");
		this.timestamp = e;
	}
	setDuration(e) {
		if (!Number.isFinite(e) || e < 0) throw TypeError("newDuration must be a non-negative number.");
		this.duration = e;
	}
	setEncodeOptions(e) {
		if (!e || typeof e != "object") throw TypeError("newEncodeOptions must be an object.");
		this.encodeOptions = e;
	}
	[Symbol.dispose]() {
		this.close();
	}
}, Go = [], Ko = 3, qo = [], Jo = 0, Yo = (e, t) => {
	for (let n of qo) if (n.canvas.width === e && n.canvas.height === t) return n.age = Jo++, {
		canvas: n.canvas,
		context: n.context,
		isNew: !1
	};
	let n;
	if (typeof OffscreenCanvas < "u") n = new OffscreenCanvas(e, t);
	else {
		if (typeof window > "u" || typeof document > "u") throw Error("Cannot transform VideoSamples in this environment. Either run in an environment with OffscreenCanvas or HTMLCanvasElement, or supply a custom VideoSample transformer using registerVideoSampleTransformer().");
		n = document.createElement("canvas"), n.width = e, n.height = t;
	}
	let r = n.getContext("2d", {
		alpha: !0,
		willReadFrequently: !1
	});
	if (!r) throw Error("The '2d' canvas context is required to transform VideoSamples. Register a custom transformer using registerVideoSampleTransformer to work around this limitation.");
	return qo.length >= Ko && qo.splice(Ue(qo, (e) => e.age), 1), qo.push({
		canvas: n,
		context: r,
		age: Jo++
	}), {
		canvas: n,
		context: r,
		isNew: !0
	};
}, Xo = class {
	constructor(e) {
		if (e !== void 0) {
			if (!e || typeof e != "object") throw TypeError("init.colorSpace, when provided, must be an object.");
			let t = Object.keys(f);
			if (e.primaries != null && !t.includes(e.primaries)) throw TypeError(`init.colorSpace.primaries, when provided, must be one of ${t.join(", ")}.`);
			let n = Object.keys(m);
			if (e.transfer != null && !n.includes(e.transfer)) throw TypeError(`init.colorSpace.transfer, when provided, must be one of ${n.join(", ")}.`);
			let r = Object.keys(g);
			if (e.matrix != null && !r.includes(e.matrix)) throw TypeError(`init.colorSpace.matrix, when provided, must be one of ${r.join(", ")}.`);
			if (e.fullRange != null && typeof e.fullRange != "boolean") throw TypeError("init.colorSpace.fullRange, when provided, must be a boolean.");
		}
		this.primaries = e?.primaries ?? null, this.transfer = e?.transfer ?? null, this.matrix = e?.matrix ?? null, this.fullRange = e?.fullRange ?? null;
	}
	toJSON() {
		return {
			primaries: this.primaries,
			transfer: this.transfer,
			matrix: this.matrix,
			fullRange: this.fullRange
		};
	}
}, Zo = (e) => typeof VideoFrame < "u" && e instanceof VideoFrame, Qo = (e, n, r) => {
	let i = Math.min(e.left, n), a = Math.min(e.top, r), o = Math.min(e.width, n - i), s = Math.min(e.height, r - a);
	return t(o >= 0), t(s >= 0), {
		left: i,
		top: a,
		width: o,
		height: s
	};
}, $o = (e, t) => {
	if (!e || typeof e != "object") throw TypeError(t + "crop, when provided, must be an object.");
	if (!Number.isInteger(e.left) || e.left < 0) throw TypeError(t + "crop.left must be a non-negative integer.");
	if (!Number.isInteger(e.top) || e.top < 0) throw TypeError(t + "crop.top must be a non-negative integer.");
	if (!Number.isInteger(e.width) || e.width < 0) throw TypeError(t + "crop.width must be a non-negative integer.");
	if (!Number.isInteger(e.height) || e.height < 0) throw TypeError(t + "crop.height must be a non-negative integer.");
}, es = (e) => {
	if (!e || typeof e != "object") throw TypeError("options must be an object.");
	if (e.colorSpace !== void 0 && !["display-p3", "srgb"].includes(e.colorSpace)) throw TypeError("options.colorSpace, when provided, must be 'display-p3' or 'srgb'.");
	if (e.format !== void 0 && typeof e.format != "string") throw TypeError("options.format, when provided, must be a string.");
	if (e.layout !== void 0) {
		if (!Array.isArray(e.layout)) throw TypeError("options.layout, when provided, must be an array.");
		for (let t of e.layout) {
			if (!t || typeof t != "object") throw TypeError("Each entry in options.layout must be an object.");
			if (!Number.isInteger(t.offset) || t.offset < 0) throw TypeError("plane.offset must be a non-negative integer.");
			if (!Number.isInteger(t.stride) || t.stride < 0) throw TypeError("plane.stride must be a non-negative integer.");
		}
	}
	if (e.rect !== void 0) {
		if (!e.rect || typeof e.rect != "object") throw TypeError("options.rect, when provided, must be an object.");
		if (e.rect.x !== void 0 && (!Number.isInteger(e.rect.x) || e.rect.x < 0)) throw TypeError("options.rect.x, when provided, must be a non-negative integer.");
		if (e.rect.y !== void 0 && (!Number.isInteger(e.rect.y) || e.rect.y < 0)) throw TypeError("options.rect.y, when provided, must be a non-negative integer.");
		if (e.rect.width !== void 0 && (!Number.isInteger(e.rect.width) || e.rect.width < 0)) throw TypeError("options.rect.width, when provided, must be a non-negative integer.");
		if (e.rect.height !== void 0 && (!Number.isInteger(e.rect.height) || e.rect.height < 0)) throw TypeError("options.rect.height, when provided, must be a non-negative integer.");
	}
}, ts = (e, t, n) => {
	let r = ns(e), i = [], a = 0;
	for (let e of r) {
		let r = Math.ceil(t / e.widthDivisor), o = Math.ceil(n / e.heightDivisor), s = r * e.sampleBytes, c = s * o;
		i.push({
			offset: a,
			stride: s
		}), a += c;
	}
	return i;
}, ns = (e) => {
	let n = (e, t, n, r, i) => {
		let a = [
			{
				sampleBytes: e,
				widthDivisor: 1,
				heightDivisor: 1
			},
			{
				sampleBytes: t,
				widthDivisor: n,
				heightDivisor: r
			},
			{
				sampleBytes: t,
				widthDivisor: n,
				heightDivisor: r
			}
		];
		return i && a.push({
			sampleBytes: e,
			widthDivisor: 1,
			heightDivisor: 1
		}), a;
	};
	switch (e) {
		case "I420": return n(1, 1, 2, 2, !1);
		case "I420P10":
		case "I420P12": return n(2, 2, 2, 2, !1);
		case "I420A": return n(1, 1, 2, 2, !0);
		case "I420AP10":
		case "I420AP12": return n(2, 2, 2, 2, !0);
		case "I422": return n(1, 1, 2, 1, !1);
		case "I422P10":
		case "I422P12": return n(2, 2, 2, 1, !1);
		case "I422A": return n(1, 1, 2, 1, !0);
		case "I422AP10":
		case "I422AP12": return n(2, 2, 2, 1, !0);
		case "I444": return n(1, 1, 1, 1, !1);
		case "I444P10":
		case "I444P12": return n(2, 2, 1, 1, !1);
		case "I444A": return n(1, 1, 1, 1, !0);
		case "I444AP10":
		case "I444AP12": return n(2, 2, 1, 1, !0);
		case "NV12": return [{
			sampleBytes: 1,
			widthDivisor: 1,
			heightDivisor: 1
		}, {
			sampleBytes: 2,
			widthDivisor: 2,
			heightDivisor: 2
		}];
		case "RGBA":
		case "RGBX":
		case "BGRA":
		case "BGRX": return [{
			sampleBytes: 4,
			widthDivisor: 1,
			heightDivisor: 1
		}];
		default: oe(e), t(!1);
	}
}, rs = (e, t) => {
	let n = {
		left: 0,
		top: 0,
		width: e.codedWidth,
		height: e.codedHeight
	}, r = t.rect, i = is(n, r, e.codedWidth, e.codedHeight, e.format), a = t.layout, o;
	if (!t.format || t.format === e.format) o = e.format;
	else if ([
		"RGBA",
		"RGBX",
		"BGRA",
		"BGRX"
	].includes(t.format)) o = t.format;
	else throw Error("NotSupportedError: Invalid destination format.");
	return os(i, o, a);
}, is = (e, t, n, r, i) => {
	let a = { ...e };
	if (t !== void 0) {
		if (t.width === 0 || t.height === 0) throw TypeError("visibleRect dimensions cannot be zero.");
		if ((t.x || 0) + (t.width || 0) > n) throw TypeError("visibleRect exceeds codedWidth.");
		if ((t.y || 0) + (t.height || 0) > r) throw TypeError("visibleRect exceeds codedHeight.");
		a.x = t.x || 0, a.y = t.y || 0, a.width = t.width || 0, a.height = t.height || 0;
	}
	if (!as(i, a)) throw TypeError("visibleRect alignment is invalid for the format.");
	return a;
}, as = (e, t) => {
	if (e === null) return !0;
	let n = ns(e);
	for (let e = 0; e < n.length; e++) {
		let r = n[e], i = r.widthDivisor, a = r.heightDivisor;
		if ((t.x || 0) % i !== 0 || (t.y || 0) % a !== 0) return !1;
	}
	return !0;
}, os = (e, t, n) => {
	let r = ns(t), i = r.length;
	if (n !== void 0 && n.length !== i) throw TypeError(`Layout must have ${i} planes.`);
	let a = 0, o = [], s = [];
	for (let t = 0; t < i; t++) {
		let i = r[t], c = i.sampleBytes, l = i.widthDivisor, u = i.heightDivisor, d = {
			destinationOffset: 0,
			destinationStride: 0,
			sourceTop: 0,
			sourceHeight: 0,
			sourceLeftBytes: 0,
			sourceWidthBytes: 0
		};
		if (d.sourceTop = Math.ceil(Math.trunc(e.y || 0) / u), d.sourceHeight = Math.ceil(Math.trunc(e.height || 0) / u), d.sourceLeftBytes = Math.floor(Math.trunc(e.x || 0) / l) * c, d.sourceWidthBytes = Math.floor(Math.trunc(e.width || 0) / l) * c, n !== void 0) {
			let e = n[t];
			if (e.stride < d.sourceWidthBytes) throw TypeError(`Stride for plane ${t} is too small.`);
			d.destinationOffset = e.offset, d.destinationStride = e.stride;
		} else d.destinationOffset = a, d.destinationStride = d.sourceWidthBytes;
		let f = d.destinationStride * d.sourceHeight + d.destinationOffset;
		if (f > 4294967295) throw TypeError("Allocation size exceeds limit.");
		s.push(f), a = Math.max(a, f);
		for (let e = 0; e < t; e++) {
			let n = o[e];
			if (!(s[t] <= n.destinationOffset || s[e] <= d.destinationOffset)) throw TypeError("Planes overlap.");
		}
		o.push(d);
	}
	return {
		allocationSize: a,
		computedLayouts: o
	};
}, ss = (e) => {
	if (!e || typeof e != "object") throw TypeError("Encoding config must be an object.");
	if (!kn.includes(e.codec)) throw TypeError(`Invalid video codec '${e.codec}'. Must be one of: ${kn.join(", ")}.`);
	let t = e.bitrate;
	if (e.quality === void 0 && t === void 0) throw TypeError("config.quality must be provided.");
	if (e.quality !== void 0 && t !== void 0) throw TypeError("config.quality and config.bitrate cannot both be provided.");
	if (e.quality !== void 0 && !(e.quality instanceof us)) throw TypeError("config.quality, when provided, must be a Quality.");
	if (t !== void 0 && !(t instanceof us) && (!Number.isInteger(t) || t <= 0)) throw TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
	if (e.keyFrameInterval !== void 0 && (!Number.isFinite(e.keyFrameInterval) || e.keyFrameInterval < 0)) throw TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
	if (e.sizeChangeBehavior !== void 0 && ![
		"deny",
		"passThrough",
		"fill",
		"contain",
		"cover"
	].includes(e.sizeChangeBehavior)) throw TypeError("config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'.");
	if (e.transform !== void 0) {
		if (typeof e.transform != "object" || !e.transform) throw TypeError("config.transform, when provided, must be an object.");
		if (e.transform.width !== void 0 && (!Number.isInteger(e.transform.width) || e.transform.width <= 0)) throw TypeError("config.transform.width, when provided, must be a positive integer.");
		if (e.transform.height !== void 0 && (!Number.isInteger(e.transform.height) || e.transform.height <= 0)) throw TypeError("config.transform.height, when provided, must be a positive integer.");
		if (e.transform.fit !== void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(e.transform.fit)) throw TypeError("config.transform.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
		if (e.transform.width !== void 0 && e.transform.height !== void 0 && e.transform.fit === void 0 && ![
			"fill",
			"contain",
			"cover"
		].includes(e.sizeChangeBehavior)) throw TypeError("When both config.transform.width and config.transform.height are provided, config.transform.fit must also be provided.");
		if (e.transform.fit !== void 0 && [
			"fill",
			"contain",
			"cover"
		].includes(e.sizeChangeBehavior) && e.transform.fit !== e.sizeChangeBehavior) throw TypeError("config.transform.fit, when provided, cannot differ from config.sizeChangeBehavior when config.sizeChangeBehavior is 'fill', 'contain' or 'cover', as sizeChangeBehavior already determines the fitting algorithm.");
		if (e.transform.rotate !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(e.transform.rotate)) throw TypeError("config.transform.rotate, when provided, must be 0, 90, 180 or 270.");
		if (e.transform.crop !== void 0 && $o(e.transform.crop, "config.transform."), e.transform.process !== void 0 && typeof e.transform.process != "function") throw TypeError("config.transform.process, when provided, must be a function.");
		if (e.transform.frameRate !== void 0 && (!Number.isFinite(e.transform.frameRate) || e.transform.frameRate <= 0)) throw TypeError("config.transform.frameRate, when provided, must be a finite positive number.");
		if (e.transform.force !== void 0 && typeof e.transform.force != "boolean") throw TypeError("config.transform.force, when provided, must be a boolean.");
	}
	if (e.onEncodedPacket !== void 0 && typeof e.onEncodedPacket != "function") throw TypeError("config.onEncodedPacket, when provided, must be a function.");
	if (e.onEncoderConfig !== void 0 && typeof e.onEncoderConfig != "function") throw TypeError("config.onEncoderConfig, when provided, must be a function.");
	if (e.onEncodedSample !== void 0 && typeof e.onEncodedSample != "function") throw TypeError("config.onEncodedSample, when provided, must be a function.");
	cs(e.codec, e);
}, cs = (e, t) => {
	if (!t || typeof t != "object") throw TypeError("Encoding options must be an object.");
	if (t.alpha !== void 0 && !["discard", "keep"].includes(t.alpha)) throw TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");
	let n = t.bitrateMode;
	if (n !== void 0 && !["constant", "variable"].includes(n)) throw TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
	if (t.latencyMode !== void 0 && !["quality", "realtime"].includes(t.latencyMode)) throw TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");
	if (t.fullCodecString !== void 0 && typeof t.fullCodecString != "string") throw TypeError("fullCodecString, when provided, must be a string.");
	if (t.fullCodecString !== void 0 && Qn(t.fullCodecString) !== e) throw TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${e}).`);
	if (t.hardwareAcceleration !== void 0 && ![
		"no-preference",
		"prefer-hardware",
		"prefer-software"
	].includes(t.hardwareAcceleration)) throw TypeError("hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
	if (t.scalabilityMode !== void 0 && typeof t.scalabilityMode != "string") throw TypeError("scalabilityMode, when provided, must be a string.");
	if (t.contentHint !== void 0 && typeof t.contentHint != "string") throw TypeError("contentHint, when provided, must be a string.");
}, ls = (e) => {
	let n = e.bitrateMode, r = e.quality._toVideoRateControl(e.codec, e.width, e.height, n), i = (t, n, r) => ({
		codec: e.fullCodecString ?? Un(e.codec, e.width, e.height, r, e.alpha === "keep"),
		width: e.width,
		height: e.height,
		displayWidth: e.squarePixelWidth,
		displayHeight: e.squarePixelHeight,
		bitrate: t,
		bitrateMode: n,
		alpha: e.alpha ?? "discard",
		framerate: e.framerate,
		latencyMode: e.latencyMode,
		hardwareAcceleration: e.hardwareAcceleration,
		scalabilityMode: e.scalabilityMode,
		contentHint: e.contentHint,
		...$n(e.codec)
	}), a = [];
	return r.quantizer !== null && a.push({
		config: i(void 0, "quantizer", r.bitrate),
		quantizer: r.quantizer
	}), r.bitrateMode !== "quantizer" && a.push({
		config: i(r.bitrate, r.bitrateMode, r.bitrate),
		quantizer: null
	}), t(a.length > 0), a;
}, us = class {
	constructor(e) {
		if ((typeof e == "number" || typeof e == "string") && (e = { quality: e }), !e || typeof e != "object") throw TypeError("options must be an object.");
		if (e.bitrateMode !== void 0 && !["constant", "variable"].includes(e.bitrateMode)) throw TypeError("options.bitrateMode, when provided, must be 'constant' or 'variable'.");
		if ("quality" in e) {
			if (typeof e.quality == "string" ? !(e.quality in ds) : typeof e.quality != "number" || Number.isNaN(e.quality)) throw TypeError("options.quality must be a number, or one of 'very-low', 'low', 'medium', 'high' or 'very-high'.");
			if (e.preferBitrate !== void 0 && typeof e.preferBitrate != "boolean") throw TypeError("options.preferBitrate, when provided, must be a boolean.");
			if ("bitrate" in e || "quantizer" in e) throw TypeError("options.quality cannot be combined with options.bitrate or options.quantizer.");
			this._quality = typeof e.quality == "string" ? ds[e.quality] : e.quality, this._preferBitrate = e.preferBitrate ?? !1, this._bitrate = void 0, this._quantizer = void 0;
		} else {
			if (e.bitrate !== void 0 && (!Number.isInteger(e.bitrate) || e.bitrate <= 0)) throw TypeError("options.bitrate, when provided, must be a positive integer.");
			if (e.quantizer !== void 0 && (!Number.isInteger(e.quantizer) || e.quantizer < 0)) throw TypeError("options.quantizer, when provided, must be a non-negative integer.");
			if (e.bitrate === void 0 && e.quantizer === void 0) throw TypeError("At least one of options.bitrate or options.quantizer must be set.");
			if ("preferBitrate" in e) throw TypeError("options.preferBitrate can only be combined with options.quality.");
			this._quality = void 0, this._preferBitrate = !1, this._bitrate = e.bitrate, this._quantizer = e.quantizer;
		}
		this._bitrateMode = e.bitrateMode;
	}
	_toVideoRateControl(e, n, r, i) {
		let a = fs[e], o = null, s = this._bitrateMode ?? i ?? "variable";
		if (this._quantizer !== void 0) {
			if (!a) {
				if (this._bitrate === void 0) throw Error(`Codec '${e}' does not support quantizer-based encoding. Provide a bitrate in the Quality to define a fallback.`);
			} else if (this._quantizer < a.min || this._quantizer > a.max) {
				if (this._bitrate === void 0) throw Error(`Quantizer ${this._quantizer} is out of range for codec '${e}'; must be between ${a.min} and ${a.max}.`);
			} else o = this._quantizer, this._bitrate === void 0 && (s = "quantizer");
		} else this._bitrate === void 0 && a && !this._preferBitrate && (t(this._quality !== void 0), o = le(Math.round(ue(a.worst, a.best, this._quality)), a.min, a.max));
		let c;
		if (this._bitrate !== void 0) c = this._bitrate;
		else {
			let i = this._quality;
			i === void 0 && (t(o !== null && a), i = le((o - a.worst) / (a.best - a.worst), 0, 1)), c = ms(e, n, r, ps(i));
		}
		return {
			quantizer: o,
			bitrate: c,
			bitrateMode: s
		};
	}
	_toVideoBitrate(e, n, r) {
		return this._bitrate === void 0 ? (t(this._quality !== void 0), ms(e, n, r, ps(this._quality))) : this._bitrate;
	}
	_toAudioBitrate(e) {
		if (An.includes(e) || e === "flac") return;
		if (this._bitrate !== void 0) return this._bitrate;
		if (this._quality === void 0) throw Error("This Quality defines neither a quality level nor a bitrate and therefore cannot be used for audio encoding.");
		let t = ps(this._quality), n = {
			aac: 128e3,
			opus: 64e3,
			mp3: 16e4,
			vorbis: 64e3,
			ac3: 384e3,
			eac3: 192e3,
			dts: 768e3
		}[e];
		if (!n) throw Error(`Unhandled codec: ${e}`);
		let r = n * t;
		return e === "aac" ? r = [
			96e3,
			128e3,
			16e4,
			192e3
		].reduce((e, t) => Math.abs(t - r) < Math.abs(e - r) ? t : e) : e === "opus" || e === "vorbis" ? r = Math.max(6e3, r) : e === "mp3" && (r = [
			8e3,
			16e3,
			24e3,
			32e3,
			4e4,
			48e3,
			64e3,
			8e4,
			96e3,
			112e3,
			128e3,
			16e4,
			192e3,
			224e3,
			256e3,
			32e4
		].reduce((e, t) => Math.abs(t - r) < Math.abs(e - r) ? t : e)), Math.round(r / 1e3) * 1e3;
	}
}, ds = {
	"very-low": 0,
	low: .25,
	medium: .5,
	high: .75,
	"very-high": 1
}, fs = {
	avc: {
		min: 0,
		max: 51,
		worst: 41,
		best: 16
	},
	hevc: {
		min: 0,
		max: 51,
		worst: 41,
		best: 16
	},
	vp9: {
		min: 0,
		max: 63,
		worst: 52,
		best: 20
	},
	av1: {
		min: 0,
		max: 255,
		worst: 208,
		best: 80
	}
}, ps = (e) => .3 * Math.exp(2.5538 * e), ms = (e, t, n, r) => {
	let i = t * n, a = 3e6, o = a * (i / 2073600) ** .95 * {
		avc: 1,
		hevc: .6,
		vp9: .6,
		av1: .4,
		vp8: 1.2,
		prores: 22e7 / a
	}[e] * r;
	return Math.ceil(o / 1e3) * 1e3;
}, hs = (e, n) => {
	if (e === "avc") return { avc: { quantizer: n } };
	if (e === "hevc") return { hevc: { quantizer: n } };
	if (e === "vp9") return { vp9: { quantizer: n } };
	if (e === "av1") return { av1: { quantizer: n } };
	t(!1);
}, gs = (e, t) => {
	if (e !== void 0) return e;
	if (t !== void 0) return t instanceof us ? t : new us({ bitrate: t });
}, _s = [], vs = [], ys = [], bs = (e) => {
	if (!e || typeof e != "object") throw TypeError("options must be an object.");
	if (e.metadataOnly !== void 0 && typeof e.metadataOnly != "boolean") throw TypeError("options.metadataOnly, when defined, must be a boolean.");
	if (e.verifyKeyPackets !== void 0 && typeof e.verifyKeyPackets != "boolean") throw TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
	if (e.verifyKeyPackets && e.metadataOnly) throw TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
	if (e.skipLiveWait !== void 0 && typeof e.skipLiveWait != "boolean") throw TypeError("options.skipLiveWait, when defined, must be a boolean.");
}, xs = (e) => {
	if (!Be(e)) throw TypeError("timestamp must be a number.");
}, Ss = (e, t, n) => n.verifyKeyPackets ? t.then(async (t) => {
	if (!t || t.type === "delta") return t;
	let n = await e.determinePacketType(t);
	return n && (t.type = n), t;
}) : t, Cs = class {
	constructor(e) {
		if (!(e instanceof Ns)) throw TypeError("track must be an InputTrack.");
		this._track = e;
	}
	async getFirstPacket(e = {}) {
		if (bs(e), this._track.input._disposed) throw new G();
		return Ss(this._track, this._track._backing.getFirstPacket(e), e);
	}
	async getFirstKeyPacket(e = {}) {
		bs(e);
		let t = await this.getFirstPacket(e);
		return t ? t.type === "key" ? t : this.getNextKeyPacket(t, e) : null;
	}
	async getPacket(e, t = {}) {
		if (xs(e), bs(t), this._track.input._disposed) throw new G();
		return Ss(this._track, this._track._backing.getPacket(e, t), t);
	}
	async getNextPacket(e, t = {}) {
		if (!(e instanceof L)) throw TypeError("packet must be an EncodedPacket.");
		if (bs(t), this._track.input._disposed) throw new G();
		return Ss(this._track, this._track._backing.getNextPacket(e, t), t);
	}
	async getKeyPacket(e, n = {}) {
		if (xs(e), bs(n), this._track.input._disposed) throw new G();
		if (!n.verifyKeyPackets) return this._track._backing.getKeyPacket(e, n);
		let r = await this._track._backing.getKeyPacket(e, n);
		return r && (t(r.type === "key"), await this._track.determinePacketType(r) === "delta" ? this.getKeyPacket(r.timestamp - 1 / await this._track.getTimeResolution(), n) : r);
	}
	async getNextKeyPacket(e, n = {}) {
		if (!(e instanceof L)) throw TypeError("packet must be an EncodedPacket.");
		if (bs(n), this._track.input._disposed) throw new G();
		if (!n.verifyKeyPackets) return this._track._backing.getNextKeyPacket(e, n);
		let r = await this._track._backing.getNextKeyPacket(e, n);
		return r && (t(r.type === "key"), await this._track.determinePacketType(r) === "delta" ? this.getNextKeyPacket(r, n) : r);
	}
	packets(e, t, n = {}) {
		if (e !== void 0 && !(e instanceof L)) throw TypeError("startPacket must be an EncodedPacket.");
		if (e !== void 0 && e.isMetadataOnly && !n?.metadataOnly) throw TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
		if (t !== void 0 && !(t instanceof L)) throw TypeError("endPacket must be an EncodedPacket.");
		if (bs(n), this._track.input._disposed) throw new G();
		let r = [], { promise: i, resolve: a } = k(), { promise: o, resolve: s } = k(), c = !1, l = !1, u = null, d = !1, f = [], p = () => Math.max(2, f.length);
		(async () => {
			let u = e ?? await this.getFirstPacket(n);
			for (; u && !l && !this._track.input._disposed && !(t && u.sequenceNumber >= t?.sequenceNumber);) {
				if (r.length > p()) {
					({promise: o, resolve: s} = k()), await o;
					continue;
				}
				r.push(u), a(), {promise: i, resolve: a} = k(), u = await this.getNextPacket(u, n);
			}
			c = !0, a();
		})().catch((e) => {
			d || (u = e, d = !0, a());
		});
		let m = this._track;
		return {
			async next() {
				for (;;) if (m.input._disposed) throw new G();
				else if (l) return {
					value: void 0,
					done: !0
				};
				else if (d) throw u;
				else if (r.length > 0) {
					let e = r.shift(), t = performance.now();
					for (f.push(t); f.length > 0 && t - f[0] >= 1e3;) f.shift();
					return s(), {
						value: e,
						done: !1
					};
				} else if (c) return {
					value: void 0,
					done: !0
				};
				else await i;
			},
			async return() {
				return l = !0, s(), a(), {
					value: void 0,
					done: !0
				};
			},
			async throw(e) {
				throw e;
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
}, ws = class {
	constructor(e, t) {
		this.onSample = e, this.onError = t;
	}
}, Ts = class {
	mediaSamplesInRange(e = -Infinity, t = Infinity, n) {
		xs(e), xs(t);
		let r = [], i = !1, a = null, { promise: o, resolve: s } = k(), { promise: c, resolve: l } = k(), u = !1, d = !1, f = !1, p = null, m = null, h = !1, g = {
			...n,
			verifyKeyPackets: !0,
			metadataOnly: !1
		};
		(async () => {
			p = await this._createDecoder((n) => {
				if (l(), n.timestamp >= t && (d = !0), d) {
					n.close();
					return;
				}
				a && (n.timestamp > e ? (r.push(a), i = !0) : a.close()), n.timestamp >= e && (r.push(n), i = !0), a = i ? null : n, r.length > 0 && (s(), {promise: o, resolve: s} = k());
			}, (e) => {
				h || (m = e, h = !0, s());
			});
			let n = this._createPacketSink(), _ = await n.getKeyPacket(e, g) ?? await n.getFirstKeyPacket(g), v = _, y = n.packets(_ ?? void 0, void 0, g);
			for (await y.next(); v && !d && !this._track.input._disposed;) {
				let e = Es(r.length);
				if (r.length + p.getDecodeQueueSize() > e) {
					({promise: c, resolve: l} = k()), await c;
					continue;
				}
				p.decode(v);
				let t = await y.next();
				if (t.done) break;
				v = t.value;
			}
			await y.return(), !f && !this._track.input._disposed && await p.flush(), !i && a && r.push(a), u = !0, s();
		})().catch((e) => {
			h || (m = e, h = !0, s());
		}).finally(() => {
			p?.close();
		});
		let _ = this._track, v = () => {
			a?.close();
			for (let e of r) e.close();
		};
		return {
			async next() {
				for (;;) if (_.input._disposed) throw v(), new G();
				else if (f) return {
					value: void 0,
					done: !0
				};
				else if (h) throw v(), m;
				else if (r.length > 0) {
					let e = r.shift();
					return l(), {
						value: e,
						done: !1
					};
				} else if (!u) await o;
				else return {
					value: void 0,
					done: !0
				};
			},
			async return() {
				return f = !0, d = !0, l(), s(), v(), {
					value: void 0,
					done: !0
				};
			},
			async throw(e) {
				throw e;
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
	mediaSamplesAtTimestamps(e, n) {
		ae(e);
		let r = ie(e), i = [], a = [], { promise: o, resolve: s } = k(), { promise: c, resolve: l } = k(), u = !1, d = !1, f = null, p = null, m = !1, h = (e) => {
			a.push(e), s(), {promise: o, resolve: s} = k();
		}, g = {
			...n,
			verifyKeyPackets: !0,
			metadataOnly: !1
		};
		(async () => {
			f = await this._createDecoder((e) => {
				if (l(), d) {
					e.close();
					return;
				}
				let t = 0;
				for (; i.length > 0 && e.timestamp - i[0] > -1e-10;) t++, i.shift();
				if (t > 0) for (let n = 0; n < t; n++) h(n < t - 1 ? e.clone() : e);
				else e.close();
			}, (e) => {
				m || (p = e, m = !0, s());
			});
			let e = this._createPacketSink(), n = null, o = null, _ = -1, v = async () => {
				t(o), t(f);
				let n = o;
				for (f.decode(n); n.sequenceNumber < _;) {
					let r = Es(a.length);
					for (; a.length + f.getDecodeQueueSize() > r && !d;) ({promise: c, resolve: l} = k()), await c;
					if (d) break;
					let i = await e.getNextPacket(n, g);
					t(i), f.decode(i), n = i;
				}
				_ = -1;
			}, y = async () => {
				t(f), await f.flush();
				for (let e = 0; e < i.length; e++) h(null);
				i.length = 0;
			};
			for await (let t of r) {
				if (xs(t), d || this._track.input._disposed) break;
				let r = await e.getPacket(t, g), a = r && await e.getKeyPacket(t, g);
				if (!a) {
					_ !== -1 && (await v(), await y()), h(null), n = null;
					continue;
				}
				n && (a.sequenceNumber !== o.sequenceNumber || r.timestamp < n.timestamp) && (await v(), await y()), i.push(r.timestamp), _ = Math.max(r.sequenceNumber, _), n = r, o = a;
			}
			!d && !this._track.input._disposed && (_ !== -1 && await v(), await y()), u = !0, s();
		})().catch((e) => {
			m || (p = e, m = !0, s());
		}).finally(() => {
			f?.close();
		});
		let _ = this._track, v = () => {
			for (let e of a) e?.close();
		};
		return {
			async next() {
				for (;;) if (_.input._disposed) throw v(), new G();
				else if (d) return {
					value: void 0,
					done: !0
				};
				else if (m) throw v(), p;
				else if (a.length > 0) {
					let e = a.shift();
					return t(e !== void 0), l(), {
						value: e,
						done: !1
					};
				} else if (!u) await o;
				else return {
					value: void 0,
					done: !0
				};
			},
			async return() {
				return d = !0, l(), s(), v(), {
					value: void 0,
					done: !0
				};
			},
			async throw(e) {
				throw e;
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	}
}, Es = (e) => e === 0 ? 40 : 8, Ds = class extends ws {
	constructor(e, n, r, i, a, o) {
		super(e, n), this.codec = r, this.decoderConfig = i, this.rotation = a, this.timeResolution = o, this.decoder = null, this.customDecoder = null, this.customDecoderCallSerializer = new we(), this.customDecoderQueueSize = 0, this.inputTimestamps = [], this.sampleQueue = [], this.currentPacketIndex = 0, this.raslSkipped = !1, this.alphaDecoder = null, this.alphaHadKeyframe = !1, this.colorQueue = [], this.alphaQueue = [], this.merger = null, this.decodedAlphaChunkCount = 0, this.alphaDecoderQueueSize = 0, this.nullAlphaFrameQueue = [], this.currentAlphaPacketIndex = 0, this.alphaRaslSkipped = !1, this.finalSamples = [], this.mergeAlphaPromises = [];
		let c = _s.find((e) => e.supports(r, i));
		if (c) this.customDecoder = new c(), this.customDecoder.codec = r, this.customDecoder.config = i, this.customDecoder.onSample = (e) => {
			if (!(e instanceof Wo)) throw TypeError("The argument passed to onSample must be a VideoSample.");
			this.finalizeAndEmitSample(e);
		}, this.customDecoder.onError = (e) => {
			n(e);
		}, this.customDecoderCallSerializer.call(() => this.customDecoder.init()).catch((e) => n(e));
		else {
			let e = (e) => {
				if (this.alphaQueue.length > 0) {
					let n = this.alphaQueue.shift();
					t(n !== void 0), this.mergeAlpha(e, n);
				} else this.colorQueue.push(e);
			};
			if (Ae()) {
				if (r === "avc" && this.decoderConfig.description) {
					let e = Ct(s(this.decoderConfig.description));
					if (e && e.sequenceParameterSets.length > 0) {
						let t = Tt(e.sequenceParameterSets[0]);
						t && t.frameMbsOnlyFlag === 0 && (this.decoderConfig = {
							...this.decoderConfig,
							hardwareAcceleration: "prefer-software"
						});
					}
				}
				v(this.decoderConfig.colorSpace) || (this.decoderConfig = {
					...this.decoderConfig,
					colorSpace: {
						primaries: this.decoderConfig.colorSpace?.primaries ?? "bt709",
						matrix: this.decoderConfig.colorSpace?.matrix ?? "bt709",
						transfer: this.decoderConfig.colorSpace?.transfer ?? "bt709",
						fullRange: this.decoderConfig.colorSpace?.fullRange ?? !1
					}
				});
			}
			let n = (/* @__PURE__ */ Error("Decoding error")).stack;
			this.decoder = new VideoDecoder({
				output: (t) => {
					try {
						e(t);
					} catch (e) {
						this.onError(e);
					}
				},
				error: (e) => {
					e.stack = n, this.onError(e);
				}
			}), this.decoder.configure(this.decoderConfig);
		}
	}
	getDecodeQueueSize() {
		return this.customDecoder ? this.customDecoderQueueSize : (t(this.decoder), Math.max(this.decoder.decodeQueueSize, this.alphaDecoder?.decodeQueueSize ?? 0));
	}
	decode(e) {
		if (this.codec === "hevc" && this.currentPacketIndex > 0 && !this.raslSkipped) {
			if (this.hasHevcRaslPicture(e.data)) return;
			this.raslSkipped = !0;
		}
		if (this.customDecoder) this.customDecoderQueueSize++, this.customDecoderCallSerializer.call(() => this.customDecoder.decode(e)).catch((e) => this.onError(e)).finally(() => this.customDecoderQueueSize--);
		else {
			if (t(this.decoder), Ee() || ee(this.inputTimestamps, e.timestamp, (e) => e), Ae() && this.currentPacketIndex === 0) {
				if (this.codec === "avc") {
					let t = [], n = !1;
					for (let r of ht(e.data, this.decoderConfig)) {
						let i = gt(e.data[r.offset]);
						if (n ||= i >= 1 && i <= 5, i === N.AUD) {
							if (n) break;
							t.length = 0;
						}
						i >= 20 && i <= 31 || t.push(e.data.subarray(r.offset, r.offset + r.length));
					}
					e = new L(xt(t, this.decoderConfig), e.type, e.timestamp, e.duration);
				} else if (this.codec === "hevc") {
					let t = Bt(e.data, this.decoderConfig);
					t && (e = new L(t, e.type, e.timestamp, e.duration));
				}
			}
			this.decoder.decode(e.toEncodedVideoChunk()), this.decodeAlphaData(e);
		}
		this.currentPacketIndex++;
	}
	decodeAlphaData(e) {
		if (!e.sideData.alpha) {
			this.pushNullAlphaFrame();
			return;
		}
		if (this.merger ||= new ks(), !this.alphaDecoder) {
			let e = (e) => {
				if (this.colorQueue.length > 0) {
					let n = this.colorQueue.shift();
					t(n !== void 0), this.mergeAlpha(n, e);
				} else this.alphaQueue.push(e);
				for (this.decodedAlphaChunkCount++; this.nullAlphaFrameQueue.length > 0 && this.nullAlphaFrameQueue[0] === this.decodedAlphaChunkCount;) if (this.nullAlphaFrameQueue.shift(), this.colorQueue.length > 0) {
					let e = this.colorQueue.shift();
					t(e !== void 0), this.mergeAlpha(e, null);
				} else this.alphaQueue.push(null);
				this.alphaDecoderQueueSize--;
			}, n = (/* @__PURE__ */ Error("Decoding error")).stack;
			this.alphaDecoder = new VideoDecoder({
				output: (t) => {
					try {
						e(t);
					} catch (e) {
						this.onError(e);
					}
				},
				error: (e) => {
					e.stack = n, this.onError(e);
				}
			}), this.alphaDecoder.configure(this.decoderConfig);
		}
		let n = Qt(this.codec, this.decoderConfig, e.sideData.alpha);
		if (this.alphaHadKeyframe ||= n === "key", this.alphaHadKeyframe) {
			if (this.codec === "hevc" && this.currentAlphaPacketIndex > 0 && !this.alphaRaslSkipped) {
				if (this.hasHevcRaslPicture(e.sideData.alpha)) {
					this.pushNullAlphaFrame();
					return;
				}
				this.alphaRaslSkipped = !0;
			}
			this.currentAlphaPacketIndex++, this.alphaDecoder.decode(e.alphaToEncodedVideoChunk(n ?? e.type)), this.alphaDecoderQueueSize++;
		} else this.pushNullAlphaFrame();
	}
	pushNullAlphaFrame() {
		this.alphaDecoderQueueSize === 0 ? this.alphaQueue.push(null) : this.nullAlphaFrameQueue.push(this.decodedAlphaChunkCount + this.alphaDecoderQueueSize);
	}
	hasHevcRaslPicture(e) {
		for (let t of Ot(e, this.decoderConfig)) {
			let n = kt(e[t.offset]);
			if (n === P.RASL_N || n === P.RASL_R) return !0;
		}
		return !1;
	}
	sampleHandler(e) {
		if (Ee()) {
			if (this.sampleQueue.length > 0 && e.timestamp >= r(this.sampleQueue).timestamp) {
				for (let e of this.sampleQueue) this.finalizeAndEmitSample(e);
				this.sampleQueue.length = 0;
			}
			ee(this.sampleQueue, e, (e) => e.timestamp);
		} else {
			let n = this.inputTimestamps.shift();
			t(n !== void 0), e.setTimestamp(n), this.finalizeAndEmitSample(e);
		}
	}
	finalizeAndEmitSample(e) {
		e.setTimestamp(Math.round(e.timestamp * this.timeResolution) / this.timeResolution), e.setDuration(Math.round(e.duration * this.timeResolution) / this.timeResolution), e.setRotation(this.rotation), this.onSample(e);
	}
	async mergeAlpha(e, n) {
		let r = k();
		this.mergeAlphaPromises.push(r.promise);
		let i = { sample: null };
		this.finalSamples.push(i);
		try {
			for (n ? (t(this.merger), i.sample = new Wo(await this.merger.merge(e, n))) : i.sample = new Wo(e); this.finalSamples.length > 0 && this.finalSamples[0].sample !== null;) {
				let e = this.finalSamples.shift();
				this.sampleHandler(e.sample);
			}
		} catch (e) {
			te(this.finalSamples, i), this.onError(e);
		} finally {
			te(this.mergeAlphaPromises, r.promise), r.resolve();
		}
	}
	async flush() {
		if (this.customDecoder ? await this.customDecoderCallSerializer.call(() => this.customDecoder.flush()) : (t(this.decoder), await Promise.all([this.decoder.flush(), this.alphaDecoder?.flush()]), await Promise.all(this.mergeAlphaPromises), this.colorQueue.forEach((e) => e.close()), this.colorQueue.length = 0, this.alphaQueue.forEach((e) => e?.close()), this.alphaQueue.length = 0, this.alphaHadKeyframe = !1, this.decodedAlphaChunkCount = 0, this.alphaDecoderQueueSize = 0, this.nullAlphaFrameQueue.length = 0, this.currentAlphaPacketIndex = 0, this.alphaRaslSkipped = !1), Ee()) {
			for (let e of this.sampleQueue) this.finalizeAndEmitSample(e);
			this.sampleQueue.length = 0;
		}
		this.currentPacketIndex = 0, this.raslSkipped = !1;
	}
	close() {
		this.customDecoder ? this.customDecoderCallSerializer.call(() => this.customDecoder.close()) : (t(this.decoder), this.decoder.state !== "closed" && this.decoder.close(), this.alphaDecoder && this.alphaDecoder.state !== "closed" && this.alphaDecoder.close(), this.colorQueue.forEach((e) => e.close()), this.colorQueue.length = 0, this.alphaQueue.forEach((e) => e?.close()), this.alphaQueue.length = 0, this.merger?.close());
		for (let e of this.sampleQueue) e.close();
		this.sampleQueue.length = 0;
	}
}, Os = null, ks = class {
	constructor() {
		this.workers = [], this.nextWorkerIndex = 0, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
	}
	merge(e, t) {
		if (this.workers.length === 0) {
			if (!Os) {
				let e = new Blob([`(${As.toString()})()`], { type: "application/javascript" });
				Os = URL.createObjectURL(e);
			}
			let e = le(navigator.hardwareConcurrency, 1, 4);
			for (let t = 0; t < e; t++) {
				let e = new Worker(Os);
				e.addEventListener("message", (e) => {
					let t = e.data, n = this.pendingRequests.get(t.id);
					n && (this.pendingRequests.delete(t.id), "error" in t ? n.reject(Error(t.error)) : n.resolve(t.frame));
				}), e.addEventListener("error", (e) => {
					let t = Error(e.message || "Color/alpha merge worker error.");
					for (let e of this.pendingRequests.values()) e.reject(t);
					this.pendingRequests.clear();
				}), this.workers.push(e);
			}
		}
		let n = this.nextRequestId++, r = k();
		this.pendingRequests.set(n, r);
		let i = this.workers[this.nextWorkerIndex];
		return this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length, i.postMessage({
			id: n,
			color: e,
			alpha: t
		}, { transfer: [e, t] }), r.promise;
	}
	close() {
		for (let e of this.workers) e.terminate();
		this.workers.length = 0;
		let e = /* @__PURE__ */ Error("Color/alpha merger closed.");
		for (let t of this.pendingRequests.values()) t.reject(e);
		this.pendingRequests.clear();
	}
}, As = () => {
	let e = null, t = null, n = Promise.resolve();
	self.addEventListener("message", (e) => {
		let { id: t, color: i, alpha: a } = e.data;
		n = n.then(async () => {
			try {
				let e = await r(i, a);
				self.postMessage({
					id: t,
					frame: e
				}, { transfer: [e] });
			} catch (e) {
				self.postMessage({
					id: t,
					error: e.message
				});
			} finally {
				i.close(), a.close();
			}
		});
	});
	let r = async (e, t) => {
		let n = e.format, r = t.format;
		if (!n || !r) throw Error("CPU color/alpha merging requires a known VideoFrame format.");
		let s = n.includes("P10"), c = n.includes("P12"), l = r.includes("P10"), u = r.includes("P12");
		if (l !== s || u !== c) throw Error(`CPU color/alpha merging requires the alpha frame to have the same bit depth as the color frame (color: '${n}', alpha: '${r}').`);
		if (n === "RGBX" || n === "RGBA" || n === "BGRX" || n === "BGRA") return await i(e, t, n);
		if (n === "I420" || n === "I420P10" || n === "I420P12" || n === "I422" || n === "I422P10" || n === "I422P12" || n === "I444" || n === "I444P10" || n === "I444P12") return await a(e, t, n);
		if (n === "NV12") return await o(e, t);
		throw Error(`CPU color/alpha merging does not support format '${n}'.`);
	}, i = async (e, t, n) => {
		let r = e.visibleRect?.width ?? e.codedWidth, i = e.visibleRect?.height ?? e.codedHeight, a = r * i, o = new Uint8Array(a * 4);
		await e.copyTo(o);
		let c = await s(t, r, i, 1);
		for (let e = 0, t = 3; e < a; e++, t += 4) o[t] = c[e];
		let l = {
			format: n === "RGBX" || n === "RGBA" ? "RGBA" : "BGRA",
			codedWidth: r,
			codedHeight: i,
			timestamp: e.timestamp,
			duration: e.duration ?? void 0,
			transfer: [o.buffer]
		};
		return new VideoFrame(o, l);
	}, a = async (e, t, n) => {
		let r = e.visibleRect?.width ?? e.codedWidth, i = e.visibleRect?.height ?? e.codedHeight, a = n.includes("P10"), o = n.includes("P12"), c = a || o ? 2 : 1, l, u;
		n.startsWith("I420") ? (l = Math.ceil(r / 2), u = Math.ceil(i / 2)) : n.startsWith("I422") ? (l = Math.ceil(r / 2), u = i) : (l = r, u = i);
		let d = r * i, f = l * u, p = d * c, m = f * c, h = d * c, g = p + 2 * m + h, _ = new Uint8Array(g);
		await e.copyTo(_);
		let v = await s(t, r, i, c), y = p + 2 * m;
		_.set(v, y);
		let b = {
			format: n.slice(0, 4) + "A" + n.slice(4),
			codedWidth: r,
			codedHeight: i,
			timestamp: e.timestamp,
			duration: e.duration ?? void 0,
			transfer: [_.buffer]
		};
		return new VideoFrame(_, b);
	}, o = async (e, n) => {
		let r = e.visibleRect?.width ?? e.codedWidth, i = e.visibleRect?.height ?? e.codedHeight, a = r * i, o = Math.ceil(r / 2) * Math.ceil(i / 2), c = e.allocationSize();
		(!t || t.byteLength !== c) && (t = new Uint8Array(c)), await e.copyTo(t);
		let l = new Uint8Array(a + 2 * o + a);
		l.set(t.subarray(0, a), 0);
		let u = a, d = a + o, f = a;
		for (let e = 0; e < o; e++) l[u + e] = t[f + e * 2], l[d + e] = t[f + e * 2 + 1];
		let p = await s(n, r, i, 1);
		l.set(p, a + 2 * o);
		let m = {
			format: "I420A",
			codedWidth: r,
			codedHeight: i,
			timestamp: e.timestamp,
			duration: e.duration ?? void 0,
			transfer: [l.buffer]
		};
		return new VideoFrame(l, m);
	}, s = async (t, n, r, i) => {
		let a = t.allocationSize();
		(!e || e.byteLength !== a) && (e = new Uint8Array(a)), await t.copyTo(e);
		let o = t.format;
		if (o === "RGBA" || o === "BGRA" || o === "RGBX" || o === "BGRX") {
			let t = o === "RGBA" || o === "RGBX" ? 0 : 2, i = n * r;
			for (let n = 0; n < i; n++) e[n] = e[n * 4 + t];
			return e.subarray(0, i);
		}
		return e.subarray(0, n * r * i);
	};
}, js = (e) => {
	if (!e || typeof e != "object") throw TypeError("decoderOptions must be an object.");
	if (e.hardwareAcceleration !== void 0 && ![
		"no-preference",
		"prefer-hardware",
		"prefer-software"
	].includes(e.hardwareAcceleration)) throw TypeError("decoderOptions.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
	if (e.optimizeForLatency !== void 0 && typeof e.optimizeForLatency != "boolean") throw TypeError("decoderOptions.optimizeForLatency, when provided, must be a boolean.");
}, Ms = class extends Ts {
	constructor(e, t = {}) {
		if (!(e instanceof Fs)) throw TypeError("videoTrack must be an InputVideoTrack.");
		js(t), super(), this._track = e, this._decoderOptions = t;
	}
	async _createDecoder(e, n) {
		if (!await this._track.canDecode()) throw Error(typeof VideoDecoder > "u" ? je("VideoDecoder") : "This video track cannot be decoded in this environment. Make sure to check decodability before using a track.");
		let r = await this._track.getCodec(), i = await this._track.getRotation(), a = await this._track.getDecoderConfig(), o = await this._track.getTimeResolution();
		return t(r && a), a = {
			...a,
			hardwareAcceleration: this._decoderOptions.hardwareAcceleration,
			optimizeForLatency: this._decoderOptions.optimizeForLatency
		}, new Ds(e, n, r, a, i, o);
	}
	_createPacketSink() {
		return new Cs(this._track);
	}
	async getSample(e, t = {}) {
		xs(e);
		for await (let n of this.mediaSamplesAtTimestamps([e], t)) return n;
		throw Error("Internal error: Iterator returned nothing.");
	}
	samples(e, t, n = {}) {
		return this.mediaSamplesInRange(e, t, n);
	}
	samplesAtTimestamps(e, t = {}) {
		return this.mediaSamplesAtTimestamps(e, t);
	}
}, Ns = class e {
	constructor(e, t) {
		this.input = e, this._backing = t;
	}
	isVideoTrack() {
		return this instanceof Fs;
	}
	isAudioTrack() {
		return this instanceof Is;
	}
	get id() {
		return this._backing.getId();
	}
	get number() {
		return this._backing.getNumber();
	}
	async getInternalCodecId() {
		return this._backing.getInternalCodecId();
	}
	get internalCodecId() {
		return W(this._backing.getInternalCodecId(), "internalCodecId", "getInternalCodecId");
	}
	async getLanguageCode() {
		return this._backing.getLanguageCode();
	}
	get languageCode() {
		return W(this._backing.getLanguageCode(), "languageCode", "getLanguageCode");
	}
	async getName() {
		return this._backing.getName();
	}
	get name() {
		return W(this._backing.getName(), "name", "getName");
	}
	async getTimeResolution() {
		return this._backing.getTimeResolution();
	}
	get timeResolution() {
		return W(this._backing.getTimeResolution(), "timeResolution", "getTimeResolution");
	}
	async isRelativeToUnixEpoch() {
		return this._backing.isRelativeToUnixEpoch();
	}
	async getUnixTimeForTimestamp(e) {
		return this._backing.getUnixTimeForTimestamp(e);
	}
	async hasUnixTimeMapping() {
		return await this._backing.getUnixTimeForTimestamp(await this.getFirstTimestamp()) !== null;
	}
	async getDisposition() {
		return this._backing.getDisposition();
	}
	get disposition() {
		return W(this._backing.getDisposition(), "disposition", "getDisposition");
	}
	async getBitrate() {
		return this._backing.getBitrate();
	}
	async getAverageBitrate() {
		return this._backing.getAverageBitrate();
	}
	async getFirstTimestamp() {
		return (await this._backing.getFirstPacket({ metadataOnly: !0 }))?.timestamp ?? 0;
	}
	async computeDuration(e) {
		let t = await this._backing.getPacket(Infinity, {
			metadataOnly: !0,
			...e
		});
		return pe((t?.timestamp ?? 0) + (t?.duration ?? 0), await this.getTimeResolution());
	}
	async getDurationFromMetadata(e = {}) {
		return this._backing.getDurationFromMetadata(e);
	}
	async computePacketStats(e = Infinity, t) {
		let n = new Cs(this), r = Infinity, i = -Infinity, a = 0, o = 0;
		for await (let s of n.packets(void 0, void 0, {
			metadataOnly: !0,
			...t
		})) {
			if (a >= e && s.timestamp >= i) break;
			r = Math.min(r, s.timestamp), i = Math.max(i, s.timestamp + s.duration), a++, o += s.byteLength;
		}
		return {
			packetCount: a,
			averagePacketRate: a ? Number((a / (i - r)).toPrecision(16)) : 0,
			averageBitrate: a ? Number((8 * o / (i - r)).toPrecision(16)) : 0
		};
	}
	async isLive() {
		return await this._backing.getLiveRefreshInterval() !== null;
	}
	async getLiveRefreshInterval() {
		return this._backing.getLiveRefreshInterval();
	}
	canBePairedWith(t) {
		if (!(t instanceof e)) throw TypeError("other must be an InputTrack.");
		return this.input !== t.input || this === t ? !1 : (this._backing.getPairingMask() & t._backing.getPairingMask()) !== 0n;
	}
	async getPairableTracks(e) {
		return this.input.getTracks(Bs({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPairableVideoTracks(e) {
		return this.input.getVideoTracks(Bs({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPairableAudioTracks(e) {
		return this.input.getAudioTracks(Bs({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPrimaryPairableVideoTrack(e) {
		return this.input.getPrimaryVideoTrack(Bs({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async getPrimaryPairableAudioTrack(e) {
		return this.input.getPrimaryAudioTrack(Bs({ filter: (e) => e.canBePairedWith(this) }, e));
	}
	async hasPairableTrack(e) {
		e &&= Ps(e);
		let t = await this.input.getTracks();
		for (let n of t) if (this.canBePairedWith(n) && (!e || await e(n))) return !0;
		return !1;
	}
	hasPairableVideoTrack(e) {
		return e &&= Ps(e), this.hasPairableTrack(async (t) => t.isVideoTrack() && (!e || await e(t)));
	}
	hasPairableAudioTrack(e) {
		return e &&= Ps(e), this.hasPairableTrack(async (t) => t.isAudioTrack() && (!e || await e(t)));
	}
}, W = (e, t, n) => {
	if (A(e)) throw Error(`'${t}' is deprecated and not available synchronously for this track. Use the preferred '${n}()' instead.`);
	return e;
}, Ps = (e) => {
	if (e !== void 0 && typeof e != "function") throw TypeError("predicate, when provided, must be a function.");
	return e ? (t) => {
		let n = (e) => {
			if (typeof e != "boolean") throw TypeError("predicate must return or resolve to a boolean value.");
			return e;
		}, r = e(t);
		return A(r) ? r.then(n) : n(r);
	} : void 0;
}, Fs = class extends Ns {
	constructor(e, t) {
		super(e, t), this._pixelAspectRatioCache = null, this._backing = t;
	}
	get type() {
		return "video";
	}
	async getCodec() {
		return this._backing.getCodec();
	}
	get codec() {
		return W(this._backing.getCodec(), "codec", "getCodec");
	}
	async hasOnlyKeyPackets() {
		return await this._backing.getHasOnlyKeyPackets?.() ?? await this._backing.getCodec() === "prores";
	}
	async getCodedWidth() {
		return this._backing.getCodedWidth();
	}
	get codedWidth() {
		return W(this._backing.getCodedWidth(), "codedWidth", "getCodedWidth");
	}
	async getCodedHeight() {
		return this._backing.getCodedHeight();
	}
	get codedHeight() {
		return W(this._backing.getCodedHeight(), "codedHeight", "getCodedHeight");
	}
	async getRotation() {
		return this._backing.getRotation();
	}
	get rotation() {
		return W(this._backing.getRotation(), "rotation", "getRotation");
	}
	async getSquarePixelWidth() {
		return this._backing.getSquarePixelWidth();
	}
	get squarePixelWidth() {
		return W(this._backing.getSquarePixelWidth(), "squarePixelWidth", "getSquarePixelWidth");
	}
	async getSquarePixelHeight() {
		return this._backing.getSquarePixelHeight();
	}
	get squarePixelHeight() {
		return W(this._backing.getSquarePixelHeight(), "squarePixelHeight", "getSquarePixelHeight");
	}
	async getPixelAspectRatio() {
		return this._pixelAspectRatioCache ??= We({
			num: await this.getSquarePixelWidth() * await this.getCodedHeight(),
			den: await this.getSquarePixelHeight() * await this.getCodedWidth()
		});
	}
	get pixelAspectRatio() {
		return this._pixelAspectRatioCache ??= We({
			num: W(this._backing.getSquarePixelWidth(), "pixelAspectRatio", "getPixelAspectRatio") * W(this._backing.getCodedHeight(), "pixelAspectRatio", "getPixelAspectRatio"),
			den: W(this._backing.getSquarePixelHeight(), "pixelAspectRatio", "getPixelAspectRatio") * W(this._backing.getCodedWidth(), "pixelAspectRatio", "getPixelAspectRatio")
		});
	}
	async getDisplayWidth() {
		return await this._backing.getMetadataDisplayWidth?.() ?? (await this.getRotation() % 180 == 0 ? this.getSquarePixelWidth() : this.getSquarePixelHeight());
	}
	get displayWidth() {
		let e = this._backing.getMetadataDisplayWidth?.();
		if (e !== void 0) {
			let t = W(e, "displayWidth", "getDisplayWidth");
			if (t !== null) return t;
		}
		return W(W(this._backing.getRotation(), "displayWidth", "getDisplayWidth") % 180 == 0 ? this._backing.getSquarePixelWidth() : this._backing.getSquarePixelHeight(), "displayWidth", "getDisplayWidth");
	}
	async getDisplayHeight() {
		return await this._backing.getMetadataDisplayHeight?.() ?? (await this.getRotation() % 180 == 0 ? this.getSquarePixelHeight() : this.getSquarePixelWidth());
	}
	get displayHeight() {
		let e = this._backing.getMetadataDisplayHeight?.();
		if (e !== void 0) {
			let t = W(e, "displayHeight", "getDisplayHeight");
			if (t !== null) return t;
		}
		return W(W(this._backing.getRotation(), "displayHeight", "getDisplayHeight") % 180 == 0 ? this._backing.getSquarePixelHeight() : this._backing.getSquarePixelWidth(), "displayHeight", "getDisplayHeight");
	}
	async getColorSpace() {
		return this._backing.getColorSpace();
	}
	async hasHighDynamicRange() {
		let e = await this._backing.getColorSpace();
		return e.primaries === "bt2020" || e.primaries === "smpte432" || e.transfer === "pq" || e.transfer === "hlg" || e.matrix === "bt2020-ncl";
	}
	async canBeTransparent() {
		return this._backing.canBeTransparent();
	}
	async getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}
	async getCodecParameterString() {
		return await this._backing.getMetadataCodecParameterString?.() ?? (await this._backing.getDecoderConfig())?.codec ?? null;
	}
	async canDecode() {
		try {
			let e = await this._backing.getDecoderConfig();
			if (!e) return !1;
			let n = await this._backing.getCodec();
			return t(n !== null), _s.some((t) => t.supports(n, e)) ? !0 : typeof VideoDecoder > "u" ? !1 : (await VideoDecoder.isConfigSupported(e)).supported === !0;
		} catch (e) {
			return j._error("Error during decodability check:", e), !1;
		}
	}
	async determinePacketType(e) {
		if (!(e instanceof L)) throw TypeError("packet must be an EncodedPacket.");
		if (e.isMetadataOnly) throw TypeError("packet must not be metadata-only to determine its type.");
		let n = await this.getCodec();
		if (n === null) return null;
		let r = await this.getDecoderConfig();
		return t(r), Qt(n, r, e.data);
	}
	async computeFrameRateMetrics(e = {}) {
		if (!e || typeof e != "object") throw TypeError("options must be an object.");
		if (e.targetPacketCount !== void 0 && (!Be(e.targetPacketCount) || e.targetPacketCount < 0)) throw TypeError("options.targetPacketCount must be a non-negative number.");
		let t = await this.getTimeResolution(), n = e.targetPacketCount ?? 256, r = new Cs(this), i = [], a = -Infinity, o = 0;
		for await (let e of r.packets(void 0, void 0, { metadataOnly: !0 })) {
			if (i.length >= n && e.timestamp >= a) break;
			i.push(e.timestamp), a = Math.max(a, e.timestamp), o++;
		}
		let s = new Float64Array(i.length);
		for (let e = 0; e < i.length; e++) s[e] = Math.round(i[e] * t);
		s.sort();
		let c = 1;
		for (let e = 1; e < s.length; e++) s[e] !== s[c - 1] && (s[c++] = s[e]);
		if (c < 2) return {
			underlyingFrameRate: null,
			bestGuessFrameRate: t,
			minFrameRate: t,
			maxFrameRate: t,
			averageFrameRate: t,
			medianFrameRate: t,
			frameRateIsConstant: !0,
			probedPacketCount: o
		};
		let l = s.subarray(0, c), u = Hs(l, t), d = u ?? t, f = u === null ? null : t / u, p = /* @__PURE__ */ new Map(), m = Infinity, h = -Infinity, g = 0;
		for (let e = 1; e < c; e++) {
			let t = l[e] - l[e - 1], n = f === null ? t : Math.max(1, Math.round(t / f));
			p.set(n, (p.get(n) ?? 0) + 1), m = Math.min(m, n), h = Math.max(h, n), g += n;
		}
		let _ = c - 1, v = [...p.keys()].sort((e, t) => e - t), y = _ - 1 >> 1, b = _ >> 1, x = 0, S = 0, C = 0;
		for (let e of v) if (C += p.get(e), x === 0 && C > y && (x = e), C > b) {
			S = e;
			break;
		}
		let w = (d / x + d / S) / 2;
		return {
			underlyingFrameRate: u,
			bestGuessFrameRate: u === null ? Ws(w) : u,
			minFrameRate: d / h,
			maxFrameRate: d / m,
			averageFrameRate: d * _ / g,
			medianFrameRate: w,
			frameRateIsConstant: u !== null && m === 1 && h === 1,
			probedPacketCount: o
		};
	}
}, Is = class extends Ns {
	constructor(e, t) {
		super(e, t), this._backing = t;
	}
	get type() {
		return "audio";
	}
	async getCodec() {
		return this._backing.getCodec();
	}
	get codec() {
		return W(this._backing.getCodec(), "codec", "getCodec");
	}
	async hasOnlyKeyPackets() {
		return await this._backing.getHasOnlyKeyPackets?.() ?? !0;
	}
	async getNumberOfChannels() {
		return this._backing.getNumberOfChannels();
	}
	get numberOfChannels() {
		return W(this._backing.getNumberOfChannels(), "numberOfChannels", "getNumberOfChannels");
	}
	async getSampleRate() {
		return this._backing.getSampleRate();
	}
	get sampleRate() {
		return W(this._backing.getSampleRate(), "sampleRate", "getSampleRate");
	}
	async getDecoderConfig() {
		return this._backing.getDecoderConfig();
	}
	async getCodecParameterString() {
		return await this._backing.getMetadataCodecParameterString?.() ?? (await this._backing.getDecoderConfig())?.codec ?? null;
	}
	async canDecode() {
		try {
			let e = await this._backing.getDecoderConfig();
			if (!e) return !1;
			let n = await this._backing.getCodec();
			return t(n !== null), vs.some((t) => t.supports(n, e)) || e.codec.startsWith("pcm-") ? !0 : typeof AudioDecoder > "u" ? !1 : (await AudioDecoder.isConfigSupported(e)).supported === !0;
		} catch (e) {
			return j._error("Error during decodability check:", e), !1;
		}
	}
	async determinePacketType(e) {
		if (!(e instanceof L)) throw TypeError("packet must be an EncodedPacket.");
		return await this.getCodec() === null ? null : "key";
	}
}, Ls = (e) => -(e ?? -Infinity), Rs = (e) => -e, zs = (e) => {
	if (typeof e != "object" || !e) throw TypeError("query must be an object.");
	if (e.filter !== void 0 && typeof e.filter != "function") throw TypeError("query.filter, when provided, must be a function.");
	if (e.sortBy !== void 0 && typeof e.sortBy != "function") throw TypeError("query.sortBy, when provided, must be a function.");
	return {
		filter: e.filter ? (t) => {
			let n = (e) => {
				if (typeof e != "boolean") throw TypeError("query.filter must return or resolve to a boolean.");
				return e;
			}, r = e.filter(t);
			return A(r) ? r.then(n) : n(r);
		} : void 0,
		sortBy: e.sortBy ? (t) => {
			let n = (e) => {
				if (typeof e != "number" && (!Array.isArray(e) || !e.every((e) => typeof e == "number"))) throw TypeError("query.sortBy must return or resolve to a number or an array of numbers.");
				return e;
			}, r = e.sortBy(t);
			return A(r) ? r.then(n) : n(r);
		} : void 0
	};
}, Bs = (e, t) => ({
	filter: e?.filter || t?.filter ? (n) => {
		let r = e?.filter?.(n) ?? !0, i = (e) => e === !1 ? !1 : t?.filter?.(n) ?? !0;
		return A(r) ? r.then(i) : i(r);
	} : void 0,
	sortBy: e?.sortBy || t?.sortBy ? (n) => {
		let r = e?.sortBy?.(n) ?? [], i = t?.sortBy?.(n) ?? [], a = (e, t) => [...Array.isArray(e) ? e : [e], ...Array.isArray(t) ? t : [t]];
		return A(r) || A(i) ? Promise.all([r, i]).then(([e, t]) => a(e, t)) : a(r, i);
	} : void 0
}), Vs = async (e, t) => {
	let n = e;
	if (t?.filter) {
		let r = e.map((e) => t.filter(e));
		if (r.some((e) => A(e))) {
			let t = await Promise.all(r);
			n = e.filter((e, n) => t[n]);
		} else n = e.filter((e, t) => r[t]);
	}
	if (!t?.sortBy) return n;
	let r = n.map((e) => t.sortBy(e)), i = r.some((e) => A(e)) ? await Promise.all(r) : r;
	return n.map((e, t) => ({
		track: e,
		sortValue: i[t]
	})).sort((e, t) => {
		let n = Array.isArray(e.sortValue) ? e.sortValue : [e.sortValue], r = Array.isArray(t.sortValue) ? t.sortValue : [t.sortValue], i = Math.max(n.length, r.length);
		for (let e = 0; e < i; e++) {
			let t = n[e] ?? 0, i = r[e] ?? 0;
			if (t !== i) return t - i;
		}
		return 0;
	}).map((e) => e.track);
}, Hs = (e, t) => {
	let n = 1e6, r = .98, i = 1 + 1e-9, a = [
		12,
		15,
		20,
		24e3 / 1001,
		24,
		25,
		3e4 / 1001,
		30,
		48,
		50,
		6e4 / 1001,
		60,
		100,
		12e4 / 1001,
		120,
		144,
		240
	];
	if (e.length < 2) return null;
	let o = new Float64Array(e.length - 1);
	for (let t = 1; t < e.length; t++) {
		let n = e[t] - e[t - 1];
		if (!(n > 0)) return null;
		o[t - 1] = n;
	}
	let s = o.slice();
	s.sort();
	let c = s[Math.floor(s.length * .05)];
	for (let e = 0; e < 6; e++) {
		let e = 0, t = 0;
		for (let n of o) {
			let r = Math.max(1, Math.round(n / c));
			Math.abs(n - r * c) >= i || (e += n, t += r);
		}
		if (t === 0) return null;
		let n = e / t;
		if (Math.abs(n - c) <= 1e-12 * Math.max(1, c)) {
			c = n;
			break;
		}
		c = n;
	}
	let l = 0, u = 0, d = 0;
	for (let e of o) {
		let t = Math.max(1, Math.round(e / c));
		Math.abs(e - t * c) >= i || (l++, u += e, d += t);
	}
	if (l / o.length < r) return null;
	c = u / d;
	let f = 1 / Math.min(d, 1e3), p = Math.max(2 ** -52, c - f), m = c + f, h = t / m, g = t / p, _ = t / c, v = null, y = Infinity;
	for (let e of a) {
		if (e < h || e > g) continue;
		let t = Math.abs(e / _ - 1);
		t < y && (v = e, y = t);
	}
	if (v === null) {
		let e = Us(p, m, n), r = Us(h, g, n);
		if (r && (!e || r.den < e.den || r.den === e.den && r.num <= e.num)) v = r.num / r.den;
		else if (e) v = t * e.den / e.num;
		else return null;
	}
	let b = t / v, x = 0;
	for (let e of o) {
		let t = Math.max(1, Math.round(e / b));
		Math.abs(e - t * b) < i && x++;
	}
	return x / o.length < r ? null : v;
}, Us = (e, t, n) => {
	for (let r = 1; r <= n; r++) {
		let n = Math.floor(e * r) + 1;
		if (n / r < t) return We({
			num: n,
			den: r
		});
	}
	return null;
}, Ws = (e) => {
	let t = [
		24 / 1.001,
		30 / 1.001,
		60 / 1.001,
		120 / 1.001
	], n = [
		12,
		15,
		20,
		24,
		25,
		30,
		48,
		50,
		60,
		100,
		120,
		144,
		240
	];
	for (let n of t) if (Math.abs(n / e - 1) <= 5e-4) return n;
	let r = e, i = Infinity;
	for (let t of n) {
		let n = Math.abs(t / e - 1);
		n <= .025 && n < i && (r = t, i = n);
	}
	return r;
};
//#endregion
//#region node_modules/mediabunny/dist/modules/src/input.js
ze();
var Gs = class e extends Je {
	get disposed() {
		return this._disposed;
	}
	constructor(t) {
		if (super(), this._demuxerPromise = null, this._format = null, this._trackBackingsCache = null, this._backingToTrack = /* @__PURE__ */ new Map(), this._disposed = !1, this._nextSourceCacheAge = 0, this._sourceRefs = [], this._sourceCache = [], this._sourceCachePromises = [], this._onFormatDetermined = null, !t || typeof t != "object") throw TypeError("options must be an object.");
		if (!Array.isArray(t.formats) || t.formats.some((e) => !(e instanceof U))) throw TypeError("options.formats must be an array of InputFormat.");
		if (!(t.source instanceof Ja || t.source instanceof Ya)) throw TypeError("options.source must be a Source or SourceRef.");
		if (t.source instanceof Ja && t.source._disposed) throw TypeError("options.source must not be a disposed Source.");
		if (t.initInput !== void 0 && !(t.initInput instanceof e)) throw TypeError("options.initInput, when provided, must be an Input.");
		t.formatOptions !== void 0 && Fo(t.formatOptions, "formatOptions"), this._formats = t.formats, this._initInput = t.initInput ?? null, this._formatOptions = t.formatOptions ?? {}, this._rootRef = t.source instanceof Ja ? t.source.ref() : t.source, this._sourceRefs.push(this._rootRef);
	}
	get _rootSource() {
		return this._rootRef.source;
	}
	async _getSourceUncached(e) {
		t(this._rootSource instanceof Xa);
		let n = await this._rootSource._resolveRequest(e);
		return this._emit("source", {
			source: n.source,
			request: e,
			isRoot: e.isRoot
		}), n;
	}
	_getSourceCached(e, n = 1) {
		let r = this._sourceCache.find((t) => t.cacheGroup === n && Za(t.request, e));
		if (r) return r.age++, Promise.resolve(r.sourceRef.source.ref());
		let i = this._sourceCachePromises.find((t) => t.cacheGroup === n && Za(t.request, e));
		if (i) return i.promise.then((e) => e.sourceRef.source.ref());
		let a = (async () => {
			let r = await this._getSourceUncached(e);
			if (He(this._sourceCache, (e) => e.cacheGroup === n && e.sourceRef.source._refCount === 1) >= 4) {
				let e = Ue(this._sourceCache, (e) => e.cacheGroup === n && e.sourceRef.source._refCount === 1 ? e.age : Infinity);
				t(e !== -1);
				let r = this._sourceCache[e];
				this._sourceCache.splice(e, 1), r.sourceRef.free(), te(this._sourceRefs, r.sourceRef);
			}
			this._sourceRefs.push(r);
			let i = this._sourceCachePromises.findIndex((t) => t.request === e);
			return t(i !== -1), this._sourceCachePromises.splice(i, 1), {
				request: e,
				sourceRef: r,
				age: this._nextSourceCacheAge++,
				cacheGroup: n
			};
		})();
		return this._sourceCachePromises.push({
			request: e,
			cacheGroup: n,
			promise: a
		}), a.then((e) => {
			let t = e.sourceRef.source.ref();
			return this._sourceCache.push(e), t;
		});
	}
	_getDemuxer() {
		return this._demuxerPromise ??= (async () => {
			this._reader = new qs(this._rootSource), this._emit("source", {
				source: this._rootSource,
				request: null,
				isRoot: !0
			});
			for (let e of this._formats) if (await e._canReadInput(this)) return this._format = e, this._onFormatDetermined?.(e), e._createDemuxer(this);
			throw new Ks();
		})();
	}
	get source() {
		return this._rootSource;
	}
	async getFormat() {
		return await this._getDemuxer(), t(this._format), this._format;
	}
	async canRead() {
		try {
			return await this._getDemuxer(), !0;
		} catch (e) {
			if (e instanceof Ks) return !1;
			throw e;
		}
	}
	async getFirstTimestamp(e) {
		e ??= await this.getTracks();
		let t = e.filter((e) => e !== null);
		if (t.length === 0) return 0;
		let n = await Promise.all(t.map((e) => e._backing.getFirstPacket({ metadataOnly: !0 }))), r = Math.min(...n.map((e) => e?.timestamp ?? Infinity));
		return r === Infinity ? 0 : r;
	}
	async computeDuration(e, t) {
		e ??= await this.getTracks();
		let n = e.filter((e) => e !== null);
		if (n.length === 0) return 0;
		let r = await Promise.all(n.map((e) => e.computeDuration(t)));
		return Math.max(...r);
	}
	async getDurationFromMetadata(e, t) {
		e ??= await this.getTracks();
		let n = e.filter((e) => e !== null), r = (await Promise.all(n.map((e) => e.getDurationFromMetadata(t)))).filter((e) => e !== null);
		return r.length === 0 ? null : Math.max(...r);
	}
	async getTracks(e) {
		return e &&= zs(e), Vs((await this._getTrackBackings()).map((e) => this._wrapBackingAsTrack(e)), e);
	}
	async getVideoTracks(e) {
		return e &&= zs(e), Vs((await this.getTracks()).filter((e) => e.isVideoTrack()), e);
	}
	async getAudioTracks(e) {
		return e &&= zs(e), Vs((await this.getTracks()).filter((e) => e.isAudioTrack()), e);
	}
	async getPrimaryVideoTrack(e) {
		e &&= zs(e);
		let t = Bs(e, { sortBy: async (e) => [
			Rs((await e.getDisposition()).default),
			Rs(await e.hasPairableAudioTrack()),
			Rs(!await e.hasOnlyKeyPackets()),
			Ls(await e.getBitrate())
		] });
		return (await this.getVideoTracks(t))[0] ?? null;
	}
	async getPrimaryAudioTrack(e) {
		e &&= zs(e);
		let t = await this.getPrimaryVideoTrack(), n = Bs(e, { sortBy: async (e) => [
			Rs(!t || e.canBePairedWith(t)),
			Rs((await e.getDisposition()).default),
			Ls(await e.getBitrate())
		] });
		return (await this.getAudioTracks(n))[0] ?? null;
	}
	async _getTrackBackings() {
		let e = await this._getDemuxer();
		return this._trackBackingsCache ??= await e.getTrackBackings();
	}
	_wrapBackingAsTrack(e) {
		let t = this._backingToTrack.get(e);
		if (t) return t;
		let n = e.getType() === "video" ? new Fs(this, e) : new Is(this, e);
		return this._backingToTrack.set(e, n), n;
	}
	async getMimeType() {
		return (await this._getDemuxer()).getMimeType();
	}
	async getMetadataTags() {
		return (await this._getDemuxer()).getMetadataTags();
	}
	dispose() {
		if (!this._disposed) {
			this._disposed = !0;
			for (let e of this._sourceRefs) e.free();
			this._sourceRefs.length = 0, this._demuxerPromise && this._demuxerPromise.then((e) => e.dispose()).catch(() => {});
		}
	}
	[Symbol.dispose]() {
		this.dispose();
	}
}, Ks = class extends Error {
	constructor(e = "Input has an unsupported or unrecognizable format.") {
		super(e), this.name = "UnsupportedInputFormatError";
	}
}, G = class extends Error {
	constructor(e = "Input has been disposed.") {
		super(e), this.name = "InputDisposedError";
	}
}, qs = class {
	constructor(e) {
		this.source = e;
	}
	get fileSize() {
		let e = this.source._getFileSize();
		if (e === void 0) throw Error("Reading file size too early; read required first.");
		return e;
	}
	get fileSizeNonStrict() {
		return this.source._getFileSize() ?? null;
	}
	requestSlice(e, t) {
		if (this.source._disposed) throw new G();
		if (e < 0 || this.fileSizeNonStrict !== null && e + t > this.fileSizeNonStrict) return null;
		if (t === 0) {
			let t = /* @__PURE__ */ new Uint8Array();
			return new Js(t, c(t), 0, e, e);
		}
		let n = e + t, r = this.source._read(e, n, 0, qa);
		return A(r) ? r.then((t) => t ? new Js(t.bytes, t.view, t.offset, e, n) : null) : r ? new Js(r.bytes, r.view, r.offset, e, n) : null;
	}
	requestSliceRange(e, n, r) {
		if (this.source._disposed) throw new G();
		if (e < 0) return null;
		if (this.fileSizeNonStrict !== null) return this.requestSlice(e, le(this.fileSizeNonStrict - e, n, r));
		{
			let i = this.requestSlice(e, r), a = (i) => i || (t(this.fileSizeNonStrict !== null), this.requestSlice(e, le(this.fileSizeNonStrict - e, n, r)));
			return A(i) ? i.then(a) : a(i);
		}
	}
	requestEntireFile() {
		return this.fileSizeNonStrict === null ? (async () => {
			let e = [], t = 0;
			for (;;) {
				if (e.length === 1 && this.fileSizeNonStrict !== null) return this.requestSlice(0, this.fileSizeNonStrict);
				let n = this.requestSliceRange(t, 0, 1024);
				if (A(n) && (n = await n), !n || n.length === 0) break;
				let r = q(n, n.length);
				e.push(r), t += n.length;
			}
			let n = new Uint8Array(t), r = 0;
			for (let t of e) n.set(t, r), r += t.length;
			return new Js(n, c(n), 0, 0, t);
		})() : this.requestSlice(0, this.fileSizeNonStrict);
	}
}, Js = class e {
	constructor(e, t, n, r, i) {
		this.bytes = e, this.view = t, this.offset = n, this.start = r, this.end = i, this.bufferPos = r - n;
	}
	static tempFromBytes(t) {
		return new e(t, c(t), 0, 0, t.length);
	}
	get length() {
		return this.end - this.start;
	}
	get filePos() {
		return this.offset + this.bufferPos;
	}
	set filePos(e) {
		this.bufferPos = e - this.offset;
	}
	get remainingLength() {
		return Math.max(this.end - this.filePos, 0);
	}
	skip(e) {
		this.bufferPos += e;
	}
	slice(t, n = this.end - t) {
		if (t < this.start || t + n > this.end) throw RangeError("Slicing outside of original slice.");
		return new e(this.bytes, this.view, this.offset, t, t + n);
	}
}, K = (e, t) => {
	if (e.filePos < e.start || e.filePos + t > e.end) throw RangeError(`Tried reading [${e.filePos}, ${e.filePos + t}), but slice is [${e.start}, ${e.end}). This is likely an internal error, please report it alongside the file that caused it.`);
}, q = (e, t) => {
	K(e, t);
	let n = e.bytes.subarray(e.bufferPos, e.bufferPos + t);
	return e.bufferPos += t, n;
}, J = (e) => (K(e, 1), e.view.getUint8(e.bufferPos++)), Ys = (e, t) => {
	K(e, 2);
	let n = e.view.getUint16(e.bufferPos, t);
	return e.bufferPos += 2, n;
}, Y = (e) => {
	K(e, 2);
	let t = e.view.getUint16(e.bufferPos, !1);
	return e.bufferPos += 2, t;
}, Xs = (e) => {
	K(e, 3);
	let t = se(e.view, e.bufferPos, !1);
	return e.bufferPos += 3, t;
}, Zs = (e) => {
	K(e, 2);
	let t = e.view.getInt16(e.bufferPos, !1);
	return e.bufferPos += 2, t;
}, Qs = (e, t) => {
	K(e, 4);
	let n = e.view.getUint32(e.bufferPos, t);
	return e.bufferPos += 4, n;
}, X = (e) => {
	K(e, 4);
	let t = e.view.getUint32(e.bufferPos, !1);
	return e.bufferPos += 4, t;
}, $s = (e) => {
	K(e, 4);
	let t = e.view.getUint32(e.bufferPos, !0);
	return e.bufferPos += 4, t;
}, ec = (e) => {
	K(e, 4);
	let t = e.view.getInt32(e.bufferPos, !1);
	return e.bufferPos += 4, t;
}, tc = (e) => {
	K(e, 4);
	let t = e.view.getInt32(e.bufferPos, !0);
	return e.bufferPos += 4, t;
}, nc = (e, t) => {
	let n, r;
	return t ? (n = Qs(e, !0), r = Qs(e, !0)) : (r = Qs(e, !1), n = Qs(e, !1)), r * 4294967296 + n;
}, Z = (e) => {
	let t = X(e), n = X(e);
	return t * 4294967296 + n;
}, rc = (e) => {
	let t = ec(e), n = X(e);
	return t * 4294967296 + n;
}, ic = (e) => {
	let t = $s(e);
	return tc(e) * 4294967296 + t;
}, ac = (e) => {
	K(e, 4);
	let t = e.view.getFloat32(e.bufferPos, !1);
	return e.bufferPos += 4, t;
}, oc = (e) => {
	K(e, 8);
	let t = e.view.getFloat64(e.bufferPos, !1);
	return e.bufferPos += 8, t;
}, Q = (e, t) => {
	K(e, t);
	let n = "";
	for (let r = 0; r < t; r++) n += String.fromCharCode(e.bytes[e.bufferPos++]);
	return n;
}, sc = (e, t, n) => l.decode(q(e, t)).split("\n").map((e) => e.trim()).filter((e) => e.length > 0 && !n?.ignore?.(e)), cc;
(function(e) {
	e[e.Unsynchronisation = 128] = "Unsynchronisation", e[e.ExtendedHeader = 64] = "ExtendedHeader", e[e.ExperimentalIndicator = 32] = "ExperimentalIndicator", e[e.Footer = 16] = "Footer";
})(cc ||= {});
var lc;
(function(e) {
	e[e.ISO_8859_1 = 0] = "ISO_8859_1", e[e.UTF_16_WITH_BOM = 1] = "UTF_16_WITH_BOM", e[e.UTF_16_BE_NO_BOM = 2] = "UTF_16_BE_NO_BOM", e[e.UTF_8 = 3] = "UTF_8";
})(lc ||= {});
var uc = /* @__PURE__ */ "Blues.Classic rock.Country.Dance.Disco.Funk.Grunge.Hip-hop.Jazz.Metal.New age.Oldies.Other.Pop.Rhythm and blues.Rap.Reggae.Rock.Techno.Industrial.Alternative.Ska.Death metal.Pranks.Soundtrack.Euro-techno.Ambient.Trip-hop.Vocal.Jazz & funk.Fusion.Trance.Classical.Instrumental.Acid.House.Game.Sound clip.Gospel.Noise.Alternative rock.Bass.Soul.Punk.Space.Meditative.Instrumental pop.Instrumental rock.Ethnic.Gothic.Darkwave.Techno-industrial.Electronic.Pop-folk.Eurodance.Dream.Southern rock.Comedy.Cult.Gangsta.Top 40.Christian rap.Pop/funk.Jungle music.Native US.Cabaret.New wave.Psychedelic.Rave.Showtunes.Trailer.Lo-fi.Tribal.Acid punk.Acid jazz.Polka.Retro.Musical.Rock 'n' roll.Hard rock.Folk.Folk rock.National folk.Swing.Fast fusion.Bebop.Latin.Revival.Celtic.Bluegrass.Avantgarde.Gothic rock.Progressive rock.Psychedelic rock.Symphonic rock.Slow rock.Big band.Chorus.Easy listening.Acoustic.Humour.Speech.Chanson.Opera.Chamber music.Sonata.Symphony.Booty bass.Primus.Porn groove.Satire.Slow jam.Club.Tango.Samba.Folklore.Ballad.Power ballad.Rhythmic Soul.Freestyle.Duet.Punk rock.Drum solo.A cappella.Euro-house.Dance hall.Goa music.Drum & bass.Club-house.Hardcore techno.Terror.Indie.Britpop.Negerpunk.Polsk punk.Beat.Christian gangsta rap.Heavy metal.Black metal.Crossover.Contemporary Christian.Christian rock.Merengue.Salsa.Thrash metal.Anime.Jpop.Synthpop.Christmas.Art rock.Baroque.Bhangra.Big beat.Breakbeat.Chillout.Downtempo.Dub.EBM.Eclectic.Electro.Electroclash.Emo.Experimental.Garage.Global.IDM.Illbient.Industro-Goth.Jam Band.Krautrock.Leftfield.Lounge.Math rock.New romantic.Nu-breakz.Post-punk.Post-rock.Psytrance.Shoegaze.Space rock.Trop rock.World music.Neoclassical.Audiobook.Audio theatre.Neue Deutsche Welle.Podcast.Indie rock.G-Funk.Dubstep.Garage rock.Psybient".split("."), dc = (e, t) => {
	let n = e.filePos;
	t.raw ??= {}, t.raw.TAG ??= q(e, 125), e.filePos = n;
	let r = fc(e, 30);
	r && (t.title ??= r);
	let i = fc(e, 30);
	i && (t.artist ??= i);
	let a = fc(e, 30);
	a && (t.album ??= a);
	let o = fc(e, 4), s = Number.parseInt(o, 10);
	Number.isInteger(s) && s > 0 && (t.date ??= new Date(String(s)));
	let c = q(e, 30), l;
	if (c[28] === 0 && c[29] !== 0) {
		let n = c[29];
		n > 0 && (t.trackNumber ??= n), e.skip(-30), l = fc(e, 28), e.skip(2);
	} else e.skip(-30), l = fc(e, 30);
	l && (t.comment ??= l);
	let u = J(e);
	u < uc.length && (t.genre ??= uc[u]);
}, fc = (e, t) => {
	let n = q(e, t), r = Ne(n.indexOf(0), n.length), i = n.subarray(0, r), a = "";
	for (let e = 0; e < i.length; e++) a += String.fromCharCode(i[e]);
	return a.trimEnd();
}, pc = (e) => {
	let t = e.filePos, n = Q(e, 3), r = J(e), i = J(e), a = J(e), o = X(e);
	if (n !== "ID3" || r === 255 || i === 255 || o & 2155905152) return e.filePos = t, null;
	let s = hr(o);
	return a & cc.Footer && (s += 10), {
		majorVersion: r,
		revision: i,
		flags: a,
		size: s
	};
}, mc = (e, t, n) => {
	if (![
		2,
		3,
		4
	].includes(t.majorVersion)) {
		j._warn(`Unsupported ID3v2 major version: ${t.majorVersion}`);
		return;
	}
	let r = new hc(t, q(e, t.flags & cc.Footer ? t.size - 10 : t.size));
	if (t.flags & cc.Unsynchronisation && t.majorVersion === 3 && r.ununsynchronizeAll(), t.flags & cc.ExtendedHeader) {
		let e = r.readU32();
		t.majorVersion === 3 ? r.pos += e : r.pos += e - 4;
	}
	for (; r.pos <= r.bytes.length - r.frameHeaderSize();) {
		let e = r.readId3V2Frame();
		if (!e) break;
		let i = r.pos, a = r.pos + e.size, o = !1, s = !1, c = !1;
		if (t.majorVersion === 3 ? (o = !!(e.flags & 64), s = !!(e.flags & 128)) : t.majorVersion === 4 && (o = !!(e.flags & 4), s = !!(e.flags & 8), c = !!(e.flags & 2) || !!(t.flags & cc.Unsynchronisation)), o) {
			j._warn(`Skipping encrypted ID3v2 frame ${e.id}`), r.pos = a;
			continue;
		}
		if (s) {
			j._warn(`Skipping compressed ID3v2 frame ${e.id}`), r.pos = a;
			continue;
		}
		if (c && r.ununsynchronizeRegion(r.pos, a), n.raw ??= {}, e.id === "TXXX") {
			let e = n.raw.TXXX ??= {}, t = r.readId3V2TextEncoding(), i = r.readId3V2Text(t, a), o = r.readId3V2Text(t, a);
			e[i] ??= o;
		} else e.id[0] === "T" ? n.raw[e.id] ??= r.readId3V2EncodingAndText(a) : n.raw[e.id] ??= r.readBytes(e.size);
		switch (r.pos = i, e.id) {
			case "TIT2":
			case "TT2":
				n.title ??= r.readId3V2EncodingAndText(a);
				break;
			case "TIT3":
			case "TT3":
				n.description ??= r.readId3V2EncodingAndText(a);
				break;
			case "TPE1":
			case "TP1":
				n.artist ??= r.readId3V2EncodingAndText(a);
				break;
			case "TALB":
			case "TAL":
				n.album ??= r.readId3V2EncodingAndText(a);
				break;
			case "TPE2":
			case "TP2":
				n.albumArtist ??= r.readId3V2EncodingAndText(a);
				break;
			case "TRCK":
			case "TRK":
				{
					let e = r.readId3V2EncodingAndText(a).split("/"), t = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(t) && t > 0 && (n.trackNumber ??= t), i && Number.isInteger(i) && i > 0 && (n.tracksTotal ??= i);
				}
				break;
			case "TPOS":
			case "TPA":
				{
					let e = r.readId3V2EncodingAndText(a).split("/"), t = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(t) && t > 0 && (n.discNumber ??= t), i && Number.isInteger(i) && i > 0 && (n.discsTotal ??= i);
				}
				break;
			case "TCON":
			case "TCO":
				{
					let e = r.readId3V2EncodingAndText(a), t = /^\((\d+)\)/.exec(e);
					if (t) {
						let e = Number.parseInt(t[1]);
						if (uc[e] !== void 0) {
							n.genre ??= uc[e];
							break;
						}
					}
					if (t = /^\d+$/.exec(e), t) {
						let e = Number.parseInt(t[0]);
						if (uc[e] !== void 0) {
							n.genre ??= uc[e];
							break;
						}
					}
					n.genre ??= e;
				}
				break;
			case "TDRC":
			case "TDAT":
				{
					let e = r.readId3V2EncodingAndText(a), t = new Date(e);
					Number.isNaN(t.getTime()) || (n.date ??= t);
				}
				break;
			case "TYER":
			case "TYE":
				{
					let e = r.readId3V2EncodingAndText(a), t = Number.parseInt(e, 10);
					Number.isInteger(t) && (n.date ??= new Date(String(t)));
				}
				break;
			case "USLT":
			case "ULT":
				{
					let e = r.readU8();
					r.pos += 3, r.readId3V2Text(e, a), n.lyrics ??= r.readId3V2Text(e, a);
				}
				break;
			case "COMM":
			case "COM":
				{
					let e = r.readU8();
					r.pos += 3, r.readId3V2Text(e, a), n.comment ??= r.readId3V2Text(e, a);
				}
				break;
			case "APIC":
			case "PIC":
				{
					let e = r.readId3V2TextEncoding(), i;
					if (t.majorVersion === 2) {
						let e = r.readAscii(3);
						i = e === "PNG" ? "image/png" : e === "JPG" ? "image/jpeg" : "image/*";
					} else i = r.readId3V2Text(e, a);
					let o = r.readU8(), s = r.readId3V2Text(e, a).trimEnd(), c = a - r.pos;
					if (c >= 0) {
						let e = r.readBytes(c);
						n.images ||= [], n.images.push({
							data: e,
							mimeType: i,
							kind: o === 3 ? "coverFront" : o === 4 ? "coverBack" : "unknown",
							description: s
						});
					}
				}
				break;
			default: r.pos += e.size;
		}
		r.pos = a;
	}
}, hc = class {
	constructor(e, t) {
		this.header = e, this.bytes = t, this.pos = 0, this.view = new DataView(t.buffer, t.byteOffset, t.byteLength);
	}
	frameHeaderSize() {
		return this.header.majorVersion === 2 ? 6 : 10;
	}
	ununsynchronizeAll() {
		let e = [];
		for (let t = 0; t < this.bytes.length; t++) {
			let n = this.bytes[t];
			e.push(n), n === 255 && t !== this.bytes.length - 1 && this.bytes[t] === 0 && t++;
		}
		this.bytes = new Uint8Array(e), this.view = new DataView(this.bytes.buffer);
	}
	ununsynchronizeRegion(e, t) {
		let n = [];
		for (let r = e; r < t; r++) {
			let e = this.bytes[r];
			n.push(e), e === 255 && r !== t - 1 && this.bytes[r + 1] === 0 && r++;
		}
		let r = this.bytes.subarray(0, e), i = this.bytes.subarray(t);
		this.bytes = new Uint8Array(r.length + n.length + i.length), this.bytes.set(r, 0), this.bytes.set(n, r.length), this.bytes.set(i, r.length + n.length), this.view = new DataView(this.bytes.buffer);
	}
	readBytes(e) {
		let t = this.bytes.subarray(this.pos, this.pos + e);
		return this.pos += e, t;
	}
	readU8() {
		let e = this.view.getUint8(this.pos);
		return this.pos += 1, e;
	}
	readU16() {
		let e = this.view.getUint16(this.pos, !1);
		return this.pos += 2, e;
	}
	readU24() {
		let e = this.view.getUint16(this.pos, !1), t = this.view.getUint8(this.pos + 2);
		return this.pos += 3, e * 256 + t;
	}
	readU32() {
		let e = this.view.getUint32(this.pos, !1);
		return this.pos += 4, e;
	}
	readAscii(e) {
		let t = "";
		for (let n = 0; n < e; n++) t += String.fromCharCode(this.view.getUint8(this.pos + n));
		return this.pos += e, t;
	}
	readId3V2Frame() {
		if (this.header.majorVersion === 2) {
			let e = this.readAscii(3);
			return e === "\0\0\0" ? null : {
				id: e,
				size: this.readU24(),
				flags: 0
			};
		}
		{
			let e = this.readAscii(4);
			if (e === "\0\0\0\0") return null;
			let t = this.readU32(), n = this.header.majorVersion === 4 ? hr(t) : t, r = this.readU16(), i = this.pos, a = (e) => {
				let t = this.pos + e;
				if (t > this.bytes.length) return !1;
				if (t <= this.bytes.length - this.frameHeaderSize()) {
					this.pos += e;
					let t = this.readAscii(4);
					if (t !== "\0\0\0\0" && !/[0-9A-Z]{4}/.test(t)) return !1;
				}
				return !0;
			};
			if (!a(n)) {
				let e = this.header.majorVersion === 4 ? t : hr(t);
				a(e) && (n = e);
			}
			return this.pos = i, {
				id: e,
				size: n,
				flags: r
			};
		}
	}
	readId3V2TextEncoding() {
		let e = this.readU8();
		if (e > 3) throw Error(`Unsupported text encoding: ${e}`);
		return e;
	}
	readId3V2Text(e, t) {
		let n = this.pos, r = this.readBytes(t - this.pos);
		switch (e) {
			case lc.ISO_8859_1: {
				let e = "";
				for (let t = 0; t < r.length; t++) {
					let i = r[t];
					if (i === 0) {
						this.pos = n + t + 1;
						break;
					}
					e += String.fromCharCode(i);
				}
				return e;
			}
			case lc.UTF_16_WITH_BOM:
				if (r[0] === 255 && r[1] === 254) {
					let e = new TextDecoder("utf-16le"), t = Ne(r.findIndex((e, t) => e === 0 && r[t + 1] === 0 && t % 2 == 0), r.length);
					return this.pos = n + Math.min(t + 2, r.length), e.decode(r.subarray(2, t));
				}
				if (r[0] === 254 && r[1] === 255) {
					let e = new TextDecoder("utf-16be"), t = Ne(r.findIndex((e, t) => e === 0 && r[t + 1] === 0 && t % 2 == 0), r.length);
					return this.pos = n + Math.min(t + 2, r.length), e.decode(r.subarray(2, t));
				}
				{
					let e = Ne(r.findIndex((e) => e === 0), r.length);
					return this.pos = n + Math.min(e + 1, r.length), l.decode(r.subarray(0, e));
				}
			case lc.UTF_16_BE_NO_BOM: {
				let e = new TextDecoder("utf-16be"), t = Ne(r.findIndex((e, t) => e === 0 && r[t + 1] === 0 && t % 2 == 0), r.length);
				return this.pos = n + Math.min(t + 2, r.length), e.decode(r.subarray(0, t));
			}
			case lc.UTF_8: {
				let e = Ne(r.findIndex((e) => e === 0), r.length);
				return this.pos = n + Math.min(e + 1, r.length), l.decode(r.subarray(0, e));
			}
		}
	}
	readId3V2EncodingAndText(e) {
		if (this.pos >= e) return "";
		let t = this.readId3V2TextEncoding();
		return this.readId3V2Text(t, e);
	}
}, gc = class {
	constructor(e) {
		this.mutex = new S(), this.trackTimestampInfo = /* @__PURE__ */ new WeakMap(), this.output = e;
	}
	onTrackClose(e) {}
	validateTimestamp(e, t, n) {
		if (t < 0) throw Error(`Timestamps must be non-negative (got ${t}s).`);
		let r = this.trackTimestampInfo.get(e);
		if (r) {
			if (n && (r.maxTimestampBeforeLastKeyPacket = r.maxTimestamp), r.maxTimestampBeforeLastKeyPacket !== null && t < r.maxTimestampBeforeLastKeyPacket) throw Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${t}s, but largest timestamp is ${r.maxTimestampBeforeLastKeyPacket}s.`);
			r.maxTimestamp = Math.max(r.maxTimestamp, t);
		} else {
			if (!n) throw Error("First packet must be a key packet.");
			r = {
				maxTimestamp: t,
				maxTimestampBeforeLastKeyPacket: null
			}, this.trackTimestampInfo.set(e, r);
		}
	}
}, _c = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g, vc = /(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/, yc = (e) => {
	let t = vc.exec(e);
	if (!t) throw Error("Expected match.");
	return 36e5 * Number(t[1] || "0") + 6e4 * Number(t[2]) + 1e3 * Number(t[3]) + Number(t[4]);
}, bc = (e) => {
	let t = Math.floor(e / 36e5), n = Math.floor(e % 36e5 / 6e4), r = Math.floor(e % 6e4 / 1e3), i = e % 1e3;
	return t.toString().padStart(2, "0") + ":" + n.toString().padStart(2, "0") + ":" + r.toString().padStart(2, "0") + "." + i.toString().padStart(3, "0");
}, xc = class {
	constructor(e, t) {
		if (this.finalized = !1, this.started = !1, this.pos = 0, this.trackedWrites = null, this.trackedStart = -1, this.trackedEnd = -1, e._writerAcquired) throw Error("Can't have multiple Writers for the same Target.");
		this.target = e, e._setMonotonicity(t), e._writerAcquired = !0;
	}
	start() {
		t(!this.started), this.target._start(), this.started = !0;
	}
	write(e) {
		t(this.started && !this.finalized), this.maybeTrackWrites(e), this.target._write(e, this.pos), this.pos += e.byteLength;
	}
	seek(e) {
		this.pos = e;
	}
	getPos() {
		return this.pos;
	}
	async flush() {
		return t(this.started && !this.finalized), this.target._flush();
	}
	async finalize() {
		t(this.started && !this.finalized), await this.target._finalize(), this.finalized = !0;
	}
	maybeTrackWrites(e) {
		if (!this.trackedWrites) return;
		let t = this.getPos();
		if (t < this.trackedStart) {
			if (t + e.byteLength <= this.trackedStart) return;
			e = e.subarray(this.trackedStart - t), t = 0;
		}
		let n = t + e.byteLength - this.trackedStart, r = this.trackedWrites.byteLength;
		for (; r < n;) r *= 2;
		if (r !== this.trackedWrites.byteLength) {
			let e = new Uint8Array(r);
			e.set(this.trackedWrites, 0), this.trackedWrites = e;
		}
		this.trackedWrites.set(e, t - this.trackedStart), this.trackedEnd = Math.max(this.trackedEnd, t + e.byteLength);
	}
	startTrackingWrites() {
		this.trackedWrites = /* @__PURE__ */ new Uint8Array(1024), this.trackedStart = this.getPos(), this.trackedEnd = this.trackedStart;
	}
	stopTrackingWrites() {
		if (!this.trackedWrites) throw Error("Internal error: Can't get tracked writes since nothing was tracked.");
		let e = {
			data: this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart),
			start: this.trackedStart,
			end: this.trackedEnd
		};
		return this.trackedWrites = null, e;
	}
}, Sc = class extends Je {
	constructor() {
		super(...arguments), this._writerAcquired = !1, this._monotonicity = null, this.onwrite = null;
	}
	_setMonotonicity(e) {
		this._monotonicity !== !1 && (this._monotonicity = e);
	}
	_dispatchWrite(e, t) {
		this.onwrite?.(e, t), this._emit("write", {
			start: e,
			end: t
		});
	}
	slice(e) {
		if (!Number.isInteger(e) || e < 0) throw TypeError("offset must be a non-negative integer.");
		return new Ec(this, e);
	}
}, Cc = 2 ** 16, wc = 2 ** 32, Tc = class extends Sc {
	constructor(e = {}) {
		if (super(), this.buffer = null, this._maxPos = 0, !e || typeof e != "object") throw TypeError("BufferTarget options, when provided, must be an object.");
		if (e.onFinalize !== void 0 && typeof e.onFinalize != "function") throw TypeError("options.onFinalize, when provided, must be a function.");
		if (this._options = e, this._supportsResize = "resize" in /* @__PURE__ */ new ArrayBuffer(0), this._supportsResize) try {
			this._buffer = new ArrayBuffer(Cc, { maxByteLength: wc });
		} catch {
			this._buffer = new ArrayBuffer(Cc), this._supportsResize = !1;
		}
		else this._buffer = new ArrayBuffer(Cc);
		this._bytes = new Uint8Array(this._buffer);
	}
	_ensureSize(e) {
		let t = this._buffer.byteLength;
		for (; t < e;) t *= 2;
		if (t !== this._buffer.byteLength) {
			if (t > wc) throw Error(`ArrayBuffer exceeded maximum size of ${wc} bytes. Please consider using another target.`);
			if (this._supportsResize) this._buffer.resize(t);
			else {
				let e = new ArrayBuffer(t), n = new Uint8Array(e);
				n.set(this._bytes, 0), this._buffer = e, this._bytes = n;
			}
		}
	}
	_start() {}
	_write(e, t) {
		this._ensureSize(t + e.byteLength), this._bytes.set(e, t), this._maxPos = Math.max(this._maxPos, t + e.byteLength), this._dispatchWrite(t, t + e.byteLength);
	}
	async _flush() {}
	async _finalize() {
		this.buffer = this._buffer.slice(0, this._maxPos), this._options.onFinalize && await this._options.onFinalize(this.buffer), this._emit("finalized");
	}
	async _close() {}
	_getSlice(e, t) {
		return this._bytes.slice(e, t);
	}
}, Ec = class extends Sc {
	constructor(e, t) {
		super(), this._baseTarget = e, this._offset = t;
	}
	_start() {}
	_write(e, t) {
		this._baseTarget._write(e, this._offset + t), this._dispatchWrite(t, t + e.byteLength);
	}
	_flush() {
		return this._baseTarget._flush();
	}
	async _finalize() {
		this._emit("finalized");
	}
	async _close() {}
	_setMonotonicity(e) {
		super._setMonotonicity(e), this._baseTarget._setMonotonicity(e);
	}
}, Dc = class {
	constructor(e, t) {
		if (this.rootPath = e, this.getTarget = t, typeof e != "string") throw TypeError("rootPath must be a string.");
		if (typeof t != "function") throw TypeError("getTarget must be a function.");
	}
}, Oc = -(2 ** 15), kc = 2 ** 15 - 1, Ac = "Mediabunny", jc = 6, Mc = 5, Nc = {
	video: 1,
	audio: 2,
	subtitle: 17
}, Pc = class extends gc {
	constructor(e, t) {
		super(e), this.trackDatas = [], this.allTracksKnown = k(), this.segment = null, this.segmentInfo = null, this.seekHead = null, this.tracksElement = null, this.tagsElement = null, this.attachmentsElement = null, this.segmentDuration = null, this.cues = null, this.currentCluster = null, this.currentClusterStartMsTimestamp = null, this.currentClusterMaxMsTimestamp = null, this.trackDatasInCurrentCluster = /* @__PURE__ */ new Map(), this.startTimestamp = Infinity, this.endTimestamp = -Infinity, this.format = t;
	}
	async start() {
		let e = await this.mutex.acquire();
		this.writer = await this.output._getRootWriter(!!this.format._options.appendOnly), this.ebmlWriter = new pi(this.writer), this.writeEBMLHeader(), this.createSegmentInfo(), this.createCues(), await this.writer.flush();
		for (let e of this.output.tracks) e.isVideoTrack() && e.metadata.decoderConfig ? this.getVideoTrackData(e, e.metadata.primingPacket ?? null, { decoderConfig: e.metadata.decoderConfig }) : e.isAudioTrack() && e.metadata.decoderConfig && this.getAudioTrackData(e, e.metadata.primingPacket ?? null, { decoderConfig: e.metadata.decoderConfig });
		e();
	}
	writeEBMLHeader() {
		this.format._options.onEbmlHeader && this.writer.startTrackingWrites();
		let e = {
			id: z.EBML,
			data: [
				{
					id: z.EBMLVersion,
					data: 1
				},
				{
					id: z.EBMLReadVersion,
					data: 1
				},
				{
					id: z.EBMLMaxIDLength,
					data: 4
				},
				{
					id: z.EBMLMaxSizeLength,
					data: 8
				},
				{
					id: z.DocType,
					data: this.format instanceof Yc ? "webm" : "matroska"
				},
				{
					id: z.DocTypeVersion,
					data: 2
				},
				{
					id: z.DocTypeReadVersion,
					data: 2
				}
			]
		};
		if (this.ebmlWriter.writeEBML(e), this.format._options.onEbmlHeader) {
			let { data: e, start: t } = this.writer.stopTrackingWrites();
			this.format._options.onEbmlHeader(e, t);
		}
	}
	maybeCreateSeekHead(e) {
		if (this.format._options.appendOnly) return;
		let t = new Uint8Array([
			28,
			83,
			187,
			107
		]), n = new Uint8Array([
			21,
			73,
			169,
			102
		]), r = new Uint8Array([
			22,
			84,
			174,
			107
		]), i = new Uint8Array([
			25,
			65,
			164,
			105
		]), a = new Uint8Array([
			18,
			84,
			195,
			103
		]), o = {
			id: z.SeekHead,
			data: [
				{
					id: z.Seek,
					data: [{
						id: z.SeekID,
						data: t
					}, {
						id: z.SeekPosition,
						size: 5,
						data: e ? this.ebmlWriter.offsets.get(this.cues) - this.segmentDataOffset : 0
					}]
				},
				{
					id: z.Seek,
					data: [{
						id: z.SeekID,
						data: n
					}, {
						id: z.SeekPosition,
						size: 5,
						data: e ? this.ebmlWriter.offsets.get(this.segmentInfo) - this.segmentDataOffset : 0
					}]
				},
				{
					id: z.Seek,
					data: [{
						id: z.SeekID,
						data: r
					}, {
						id: z.SeekPosition,
						size: 5,
						data: e ? this.ebmlWriter.offsets.get(this.tracksElement) - this.segmentDataOffset : 0
					}]
				},
				this.attachmentsElement ? {
					id: z.Seek,
					data: [{
						id: z.SeekID,
						data: i
					}, {
						id: z.SeekPosition,
						size: 5,
						data: e ? this.ebmlWriter.offsets.get(this.attachmentsElement) - this.segmentDataOffset : 0
					}]
				} : null,
				this.tagsElement ? {
					id: z.Seek,
					data: [{
						id: z.SeekID,
						data: a
					}, {
						id: z.SeekPosition,
						size: 5,
						data: e ? this.ebmlWriter.offsets.get(this.tagsElement) - this.segmentDataOffset : 0
					}]
				} : null
			]
		};
		this.seekHead = o;
	}
	createSegmentInfo() {
		let e = {
			id: z.Duration,
			data: new ri(0)
		};
		this.segmentDuration = e;
		let t = {
			id: z.Info,
			data: [
				{
					id: z.TimestampScale,
					data: 1e6
				},
				{
					id: z.MuxingApp,
					data: Ac
				},
				{
					id: z.WritingApp,
					data: Ac
				},
				this.format._options.appendOnly ? null : e
			]
		};
		this.segmentInfo = t;
	}
	createTracks() {
		let e = {
			id: z.Tracks,
			data: []
		};
		this.tracksElement = e;
		for (let n of this.trackDatas) {
			let r = V[n.track.source._codec];
			t(r), n.type === "audio" && n.track.source._codec === "dts" && (n.info.decoderConfig.codec === "dtse" ? r = "A_DTS/EXPRESS" : n.info.decoderConfig.codec === "dtsl" && (r = "A_DTS/LOSSLESS"));
			let i = 0;
			if (n.type === "audio" && n.track.source._codec === "opus") {
				i = 8e7;
				let e = n.info.decoderConfig.description;
				if (e) {
					let t = Jt(s(e));
					i = Math.round(1e9 * (t.preSkip / Yn));
				}
			}
			e.data.push({
				id: z.TrackEntry,
				data: [
					{
						id: z.TrackNumber,
						data: n.track.id
					},
					{
						id: z.TrackUID,
						data: n.track.id
					},
					{
						id: z.TrackType,
						data: Nc[n.type]
					},
					n.track.metadata.disposition?.default === !1 ? {
						id: z.FlagDefault,
						data: 0
					} : null,
					n.track.metadata.disposition?.forced ? {
						id: z.FlagForced,
						data: 1
					} : null,
					n.track.metadata.disposition?.hearingImpaired ? {
						id: z.FlagHearingImpaired,
						data: 1
					} : null,
					n.track.metadata.disposition?.visuallyImpaired ? {
						id: z.FlagVisualImpaired,
						data: 1
					} : null,
					n.track.metadata.disposition?.original ? {
						id: z.FlagOriginal,
						data: 1
					} : null,
					n.track.metadata.disposition?.commentary ? {
						id: z.FlagCommentary,
						data: 1
					} : null,
					{
						id: z.FlagLacing,
						data: 0
					},
					{
						id: z.Language,
						data: n.track.metadata.languageCode ?? "und"
					},
					{
						id: z.CodecID,
						data: r
					},
					n.codecPrivate ? {
						id: z.CodecPrivate,
						data: s(n.codecPrivate)
					} : null,
					{
						id: z.CodecDelay,
						data: 0
					},
					{
						id: z.SeekPreRoll,
						data: i
					},
					n.track.metadata.name === void 0 ? null : {
						id: z.Name,
						data: new ai(n.track.metadata.name)
					},
					n.type === "video" ? this.videoSpecificTrackInfo(n) : null,
					n.type === "audio" ? this.audioSpecificTrackInfo(n) : null,
					n.type === "subtitle" ? this.subtitleSpecificTrackInfo(n) : null
				]
			});
		}
	}
	videoSpecificTrackInfo(e) {
		let { frameRate: t, rotation: r } = e.track.metadata, i = [t ? {
			id: z.DefaultDuration,
			data: 1e9 / t
		} : null], a = r ? n(-r) : 0, o = !!e.info.aspectRatio && e.info.aspectRatio.num * e.info.height !== e.info.aspectRatio.den * e.info.width, s = e.info.decoderConfig.colorSpace, c = {
			id: z.Video,
			data: [
				{
					id: z.PixelWidth,
					data: e.info.width
				},
				{
					id: z.PixelHeight,
					data: e.info.height
				},
				o ? {
					id: z.DisplayWidth,
					data: e.info.aspectRatio.num
				} : null,
				o ? {
					id: z.DisplayHeight,
					data: e.info.aspectRatio.den
				} : null,
				o ? {
					id: z.DisplayUnit,
					data: 3
				} : null,
				e.info.alphaMode ? {
					id: z.AlphaMode,
					data: 1
				} : null,
				y(s) ? null : {
					id: z.Colour,
					data: [
						{
							id: z.MatrixCoefficients,
							data: s?.matrix == null ? 2 : g[s.matrix]
						},
						{
							id: z.TransferCharacteristics,
							data: s?.transfer == null ? 2 : m[s.transfer]
						},
						{
							id: z.Primaries,
							data: s?.primaries == null ? 2 : f[s.primaries]
						},
						{
							id: z.Range,
							data: s?.fullRange == null ? 0 : s.fullRange ? 2 : 1
						}
					]
				},
				a ? {
					id: z.Projection,
					data: [{
						id: z.ProjectionType,
						data: 0
					}, {
						id: z.ProjectionPoseRoll,
						data: new ni((a + 180) % 360 - 180)
					}]
				} : null
			]
		};
		return i.push(c), i;
	}
	audioSpecificTrackInfo(e) {
		let t = An.includes(e.track.source._codec) ? Zn(e.track.source._codec) : null;
		return [{
			id: z.Audio,
			data: [
				{
					id: z.SamplingFrequency,
					data: new ni(e.info.sampleRate)
				},
				{
					id: z.Channels,
					data: e.info.numberOfChannels
				},
				t ? {
					id: z.BitDepth,
					data: 8 * t.sampleSize
				} : null
			]
		}];
	}
	subtitleSpecificTrackInfo(e) {
		return [];
	}
	maybeCreateTags() {
		let e = [], t = (t, n) => {
			e.push({
				id: z.SimpleTag,
				data: [{
					id: z.TagName,
					data: new ai(t)
				}, typeof n == "string" ? {
					id: z.TagString,
					data: new ai(n)
				} : {
					id: z.TagBinary,
					data: n
				}]
			});
		}, n = this.output._metadataTags, r = /* @__PURE__ */ new Set();
		for (let { key: e, value: i } of Fe(n)) switch (e) {
			case "title":
				t("TITLE", i), r.add("TITLE");
				break;
			case "description":
				t("DESCRIPTION", i), r.add("DESCRIPTION");
				break;
			case "artist":
				t("ARTIST", i), r.add("ARTIST");
				break;
			case "album":
				t("ALBUM", i), r.add("ALBUM");
				break;
			case "albumArtist":
				t("ALBUM_ARTIST", i), r.add("ALBUM_ARTIST");
				break;
			case "genre":
				t("GENRE", i), r.add("GENRE");
				break;
			case "comment":
				t("COMMENT", i), r.add("COMMENT");
				break;
			case "lyrics":
				t("LYRICS", i), r.add("LYRICS");
				break;
			case "date":
				t("DATE", i.toISOString().slice(0, 10)), r.add("DATE");
				break;
			case "trackNumber":
				t("PART_NUMBER", n.tracksTotal === void 0 ? i.toString() : `${i}/${n.tracksTotal}`), r.add("PART_NUMBER");
				break;
			case "discNumber":
				t("DISC", n.discsTotal === void 0 ? i.toString() : `${i}/${n.discsTotal}`), r.add("DISC");
				break;
			case "tracksTotal":
			case "discsTotal": break;
			case "images":
			case "raw": break;
			default: oe(e);
		}
		if (n.raw) for (let e in n.raw) {
			let i = n.raw[e];
			i == null || r.has(e) || (typeof i == "string" || i instanceof Uint8Array) && t(e, i);
		}
		e.length !== 0 && (this.tagsElement = {
			id: z.Tags,
			data: [{
				id: z.Tag,
				data: [{
					id: z.Targets,
					data: [{
						id: z.TargetTypeValue,
						data: 50
					}, {
						id: z.TargetType,
						data: "MOVIE"
					}]
				}, ...e]
			}]
		});
	}
	maybeCreateAttachments() {
		let e = this.output._metadataTags, t = [], n = /* @__PURE__ */ new Set(), r = e.images ?? [];
		for (let e of r) {
			let r = e.name;
			r === void 0 && (r = (e.kind === "coverFront" ? "cover" : e.kind === "coverBack" ? "back" : "image") + (Ie(e.mimeType) ?? ""));
			let i;
			for (;;) {
				i = 0n;
				for (let e = 0; e < 8; e++) i <<= 8n, i |= BigInt(Math.floor(Math.random() * 256));
				if (i !== 0n && !n.has(i)) break;
			}
			n.add(i), t.push({
				id: z.AttachedFile,
				data: [
					e.description === void 0 ? null : {
						id: z.FileDescription,
						data: new ai(e.description)
					},
					{
						id: z.FileName,
						data: new ai(r)
					},
					{
						id: z.FileMediaType,
						data: e.mimeType
					},
					{
						id: z.FileData,
						data: e.data
					},
					{
						id: z.FileUID,
						data: i
					}
				]
			});
		}
		for (let [n, i] of Object.entries(e.raw ?? {})) i instanceof Qe && /^\d+$/.test(n) && (r.find((e) => e.mimeType === i.mimeType && Re(e.data, i.data)) || t.push({
			id: z.AttachedFile,
			data: [
				i.description === void 0 ? null : {
					id: z.FileDescription,
					data: new ai(i.description)
				},
				{
					id: z.FileName,
					data: new ai(i.name ?? "")
				},
				{
					id: z.FileMediaType,
					data: i.mimeType ?? ""
				},
				{
					id: z.FileData,
					data: i.data
				},
				{
					id: z.FileUID,
					data: BigInt(n)
				}
			]
		}));
		t.length !== 0 && (this.attachmentsElement = {
			id: z.Attachments,
			data: t
		});
	}
	createSegment() {
		this.createTracks(), this.maybeCreateTags(), this.maybeCreateAttachments(), this.maybeCreateSeekHead(!1);
		let e = {
			id: z.Segment,
			size: this.format._options.appendOnly ? -1 : jc,
			data: [
				this.seekHead,
				this.segmentInfo,
				this.tracksElement,
				this.attachmentsElement,
				this.tagsElement
			]
		};
		if (this.segment = e, this.format._options.onSegmentHeader && this.writer.startTrackingWrites(), this.ebmlWriter.writeEBML(e), this.format._options.onSegmentHeader) {
			let { data: e, start: t } = this.writer.stopTrackingWrites();
			this.format._options.onSegmentHeader(e, t);
		}
	}
	createCues() {
		this.cues = {
			id: z.Cues,
			data: []
		};
	}
	get segmentDataOffset() {
		return t(this.segment), this.ebmlWriter.dataOffsets.get(this.segment);
	}
	allTracksAreKnown() {
		for (let e of this.output.tracks) if (!e.source._closed && !this.trackDatas.some((t) => t.track === e)) return !1;
		return !0;
	}
	async getMimeType() {
		await this.allTracksKnown.promise;
		let e = this.trackDatas.map((e) => e.type === "video" || e.type === "audio" ? e.info.decoderConfig.codec : { webvtt: "wvtt" }[e.track.source._codec]);
		return Ei({
			isWebM: this.format instanceof Yc,
			hasVideo: this.trackDatas.some((e) => e.type === "video"),
			hasAudio: this.trackDatas.some((e) => e.type === "audio"),
			codecStrings: e
		});
	}
	getVideoTrackData(e, n, r) {
		let i = this.trackDatas.find((t) => t.track === e);
		if (i) return i;
		ar(r, e.source._codec), t(r), t(r.decoderConfig), t(r.decoderConfig.codedWidth !== void 0), t(r.decoderConfig.codedHeight !== void 0);
		let a = r.decoderConfig.displayAspectWidth, o = r.decoderConfig.displayAspectHeight, s = a === void 0 || o === void 0 ? null : We({
			num: a,
			den: o
		}), c = {
			track: e,
			type: "video",
			info: {
				width: r.decoderConfig.codedWidth,
				height: r.decoderConfig.codedHeight,
				aspectRatio: s,
				decoderConfig: r.decoderConfig,
				alphaMode: n ? !!n.sideData.alpha : null
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null,
			codecPrivate: r.decoderConfig.description ?? null,
			closed: !1
		};
		return e.source._codec === "vp9" ? c.codecPrivate = new Uint8Array(Wn(c.info.decoderConfig.codec)) : e.source._codec === "av1" ? c.codecPrivate = new Uint8Array(Gn(c.info.decoderConfig.codec)) : e.source._codec === "prores" && (c.codecPrivate = u.encode(r.decoderConfig.codec)), this.trackDatas.push(c), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), c;
	}
	getAudioTrackData(e, n, r) {
		let i = this.trackDatas.find((t) => t.track === e);
		if (i) return i;
		sr(r, e.source._codec), t(r), t(r.decoderConfig);
		let a = { ...r.decoderConfig }, o = !1;
		if (e.source._codec === "aac" && !a.description) {
			if (!n) throw Error("No AAC description provided; you must therefore provide a priming packet.");
			let e = ea(Js.tempFromBytes(n.data));
			if (!e) throw Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");
			let t = nt[e.samplingFrequencyIndex], r = rt[e.channelConfiguration];
			if (t === void 0 || r === void 0) throw Error("Invalid ADTS frame header.");
			a.description = st({
				objectType: e.objectType,
				outputSampleRate: t,
				outputNumberOfChannels: r
			}), o = !0;
		}
		let s = {
			track: e,
			type: "audio",
			info: {
				numberOfChannels: r.decoderConfig.numberOfChannels,
				sampleRate: r.decoderConfig.sampleRate,
				decoderConfig: a,
				requiresAdtsStripping: o
			},
			chunkQueue: [],
			lastWrittenMsTimestamp: null,
			codecPrivate: a.description ?? null,
			closed: !1
		};
		return this.trackDatas.push(s), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), s;
	}
	getSubtitleTrackData(e, n) {
		let r = this.trackDatas.find((t) => t.track === e);
		if (r) return r;
		cr(n), t(n), t(n.config);
		let i = {
			track: e,
			type: "subtitle",
			info: { config: n.config },
			chunkQueue: [],
			lastWrittenMsTimestamp: null,
			codecPrivate: u.encode(n.config.description),
			closed: !1
		};
		return this.trackDatas.push(i), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), i;
	}
	async addEncodedVideoPacket(e, t, n) {
		let r = await this.mutex.acquire();
		try {
			let r = this.getVideoTrackData(e, t, n);
			r.info.alphaMode ??= !!t.sideData.alpha;
			let i = t.data;
			if (e.source._codec === "prores") {
				if (i.byteLength < 8) throw Error("ProRes packet too small, expected at least 8 bytes.");
				i = i.subarray(8);
			}
			let a = t.type === "key";
			this.validateTimestamp(r.track, t.timestamp, a);
			let o = t.timestamp, s = t.duration;
			e.metadata.frameRate !== void 0 && (o = pe(o, e.metadata.frameRate), s = pe(s, e.metadata.frameRate));
			let c = r.info.alphaMode ? t.sideData.alpha ?? null : null, l = this.createInternalChunk(i, o, s, t.type, c);
			e.source._codec === "vp9" && this.fixVP9ColorSpace(r, l), r.chunkQueue.push(l), await this.interleaveChunks();
		} finally {
			r();
		}
	}
	async addEncodedAudioPacket(e, t, n) {
		let r = await this.mutex.acquire();
		try {
			let r = this.getAudioTrackData(e, t, n), i = t.data;
			if (r.info.requiresAdtsStripping) {
				let e = ea(Js.tempFromBytes(i));
				if (!e) throw Error("Expected ADTS frame, didn't get one.");
				let t = e.crcCheck === null ? 7 : 9;
				i = i.subarray(t);
			}
			let a = t.type === "key";
			this.validateTimestamp(r.track, t.timestamp, a);
			let o = this.createInternalChunk(i, t.timestamp, t.duration, t.type);
			r.chunkQueue.push(o), await this.interleaveChunks();
		} finally {
			r();
		}
	}
	async addSubtitleCue(e, t, n) {
		let r = await this.mutex.acquire();
		try {
			let r = this.getSubtitleTrackData(e, n);
			this.validateTimestamp(r.track, t.timestamp, !0);
			let i = t.text, a = Math.round(t.timestamp * 1e3);
			_c.lastIndex = 0, i = i.replace(_c, (e) => `<${bc(yc(e.slice(1, -1)) - a)}>`);
			let o = u.encode(i), s = `${t.settings ?? ""}\n${t.identifier ?? ""}\n${t.notes ?? ""}`, c = this.createInternalChunk(o, t.timestamp, t.duration, "key", s.trim() ? u.encode(s) : null);
			r.chunkQueue.push(c), await this.interleaveChunks();
		} finally {
			r();
		}
	}
	async interleaveChunks(e = !1) {
		if (!(!e && !this.allTracksAreKnown())) {
			outer: for (;;) {
				let t = null, n = Infinity;
				for (let r of this.trackDatas) {
					if (!e && r.chunkQueue.length === 0 && !r.closed) break outer;
					r.chunkQueue.length > 0 && r.chunkQueue[0].timestamp < n && (t = r, n = r.chunkQueue[0].timestamp);
				}
				if (!t) break;
				let r = t.chunkQueue.shift();
				this.writeBlock(t, r);
			}
			e || await this.writer.flush();
		}
	}
	fixVP9ColorSpace(e, t) {
		if (t.type !== "key" || !e.info.decoderConfig.colorSpace || !e.info.decoderConfig.colorSpace.matrix) return;
		let n = new M(t.data);
		n.skipBits(2);
		let r = n.readBits(1), i = (n.readBits(1) << 1) + r;
		if (i === 3 && n.skipBits(1), n.readBits(1) || n.readBits(1) !== 0 || (n.skipBits(2), n.readBits(24) !== 4817730)) return;
		i >= 2 && n.skipBits(1);
		let a = {
			rgb: 7,
			bt709: 2,
			bt470bg: 1,
			smpte170m: 3
		}[e.info.decoderConfig.colorSpace.matrix];
		o(t.data, n.pos, n.pos + 3, a);
	}
	createInternalChunk(e, t, n, r, i = null) {
		return {
			data: e,
			type: r,
			timestamp: t,
			duration: n,
			additions: i
		};
	}
	writeBlock(e, n) {
		this.segment || this.createSegment();
		let r = Math.round(1e3 * n.timestamp), i = this.trackDatas.every((t) => {
			if (e === t) return n.type === "key";
			let r = t.chunkQueue[0];
			return r ? r.type === "key" : t.closed;
		}), a = !1;
		if (!this.currentCluster) a = !0;
		else {
			t(this.currentClusterStartMsTimestamp !== null), t(this.currentClusterMaxMsTimestamp !== null);
			let e = r - this.currentClusterStartMsTimestamp;
			a = i && r > this.currentClusterMaxMsTimestamp && e >= 1e3 * (this.format._options.minimumClusterDuration ?? 1) || e > kc;
		}
		a && this.createNewCluster(r);
		let o = r - this.currentClusterStartMsTimestamp;
		if (o < Oc) return;
		let s = /* @__PURE__ */ new Uint8Array(4), c = new DataView(s.buffer);
		c.setUint8(0, 128 | e.track.id), c.setInt16(1, o, !1);
		let l = Math.round(1e3 * n.duration);
		if (n.additions || e.type === "subtitle") {
			let t = {
				id: z.BlockGroup,
				data: [
					{
						id: z.Block,
						data: [s, n.data]
					},
					n.type === "delta" ? {
						id: z.ReferenceBlock,
						data: new ii(e.lastWrittenMsTimestamp - r)
					} : null,
					n.additions ? {
						id: z.BlockAdditions,
						data: [{
							id: z.BlockMore,
							data: [{
								id: z.BlockAddID,
								data: 1
							}, {
								id: z.BlockAdditional,
								data: n.additions
							}]
						}]
					} : null,
					l > 0 ? {
						id: z.BlockDuration,
						data: l
					} : null
				]
			};
			this.ebmlWriter.writeEBML(t);
		} else {
			c.setUint8(3, Number(n.type === "key") << 7);
			let e = {
				id: z.SimpleBlock,
				data: [s, n.data]
			};
			this.ebmlWriter.writeEBML(e);
		}
		this.startTimestamp = Math.min(this.startTimestamp, r), this.endTimestamp = Math.max(this.endTimestamp, r + l), e.lastWrittenMsTimestamp = r, this.trackDatasInCurrentCluster.has(e) || this.trackDatasInCurrentCluster.set(e, { firstMsTimestamp: r }), this.currentClusterMaxMsTimestamp = Math.max(this.currentClusterMaxMsTimestamp, r);
	}
	createNewCluster(e) {
		this.currentCluster && this.finalizeCurrentCluster(), this.format._options.onCluster && this.writer.startTrackingWrites(), this.currentCluster = {
			id: z.Cluster,
			size: this.format._options.appendOnly ? -1 : Mc,
			data: [{
				id: z.Timestamp,
				data: e
			}]
		}, this.ebmlWriter.writeEBML(this.currentCluster), this.currentClusterStartMsTimestamp = e, this.currentClusterMaxMsTimestamp = e, this.trackDatasInCurrentCluster.clear();
	}
	finalizeCurrentCluster() {
		if (t(this.currentCluster), !this.format._options.appendOnly) {
			let e = this.writer.getPos() - this.ebmlWriter.dataOffsets.get(this.currentCluster), t = this.writer.getPos();
			this.writer.seek(this.ebmlWriter.offsets.get(this.currentCluster) + 4), this.ebmlWriter.writeVarInt(e, Mc), this.writer.seek(t);
		}
		if (this.format._options.onCluster) {
			t(this.currentClusterStartMsTimestamp !== null);
			let { data: e, start: n } = this.writer.stopTrackingWrites();
			this.format._options.onCluster(e, n, this.currentClusterStartMsTimestamp / 1e3);
		}
		let e = this.ebmlWriter.offsets.get(this.currentCluster) - this.segmentDataOffset, n = /* @__PURE__ */ new Map();
		for (let [e, { firstMsTimestamp: t }] of this.trackDatasInCurrentCluster) n.has(t) || n.set(t, []), n.get(t).push(e);
		let r = [...n.entries()].sort((e, t) => e[0] - t[0]);
		for (let [n, i] of r) t(this.cues), this.cues.data.push({
			id: z.CuePoint,
			data: [{
				id: z.CueTime,
				data: n
			}, ...i.map((t) => ({
				id: z.CueTrackPositions,
				data: [{
					id: z.CueTrack,
					data: t.track.id
				}, {
					id: z.CueClusterPosition,
					data: e
				}]
			}))]
		});
	}
	async onTrackClose(e) {
		let t = await this.mutex.acquire(), n = this.trackDatas.find((t) => t.track === e);
		n && (n.closed = !0), this.allTracksAreKnown() && this.allTracksKnown.resolve(), await this.interleaveChunks(), t();
	}
	async finalize() {
		let e = await this.mutex.acquire();
		this.allTracksKnown.resolve();
		for (let e of this.trackDatas) e.closed = !0;
		if (this.segment || this.createSegment(), await this.interleaveChunks(!0), this.currentCluster && this.finalizeCurrentCluster(), t(this.cues), this.ebmlWriter.writeEBML(this.cues), !this.format._options.appendOnly) {
			let e = this.writer.getPos() - this.segmentDataOffset;
			this.writer.seek(this.ebmlWriter.offsets.get(this.segment) + 4), this.ebmlWriter.writeVarInt(e, jc);
			let n = this.startTimestamp === Infinity ? 0 : this.endTimestamp - this.startTimestamp;
			this.segmentDuration.data = new ri(n), this.writer.seek(this.ebmlWriter.offsets.get(this.segmentDuration)), this.ebmlWriter.writeEBML(this.segmentDuration), t(this.seekHead), this.writer.seek(this.ebmlWriter.offsets.get(this.seekHead)), this.maybeCreateSeekHead(!0), this.ebmlWriter.writeEBML(this.seekHead);
		}
		e();
	}
}, Fc = function(e, t, n) {
	if (t != null) {
		if (typeof t != "object" && typeof t != "function") throw TypeError("Object expected.");
		var r, i;
		if (n) {
			if (!Symbol.asyncDispose) throw TypeError("Symbol.asyncDispose is not defined.");
			r = t[Symbol.asyncDispose];
		}
		if (r === void 0) {
			if (!Symbol.dispose) throw TypeError("Symbol.dispose is not defined.");
			r = t[Symbol.dispose], n && (i = r);
		}
		if (typeof r != "function") throw TypeError("Object not disposable.");
		i && (r = function() {
			try {
				i.call(this);
			} catch (e) {
				return Promise.reject(e);
			}
		}), e.stack.push({
			value: t,
			dispose: r,
			async: n
		});
	} else n && e.stack.push({ async: !0 });
	return t;
}, Ic = (function(e) {
	return function(t) {
		function n(n) {
			t.error = t.hasError ? new e(n, t.error, "An error was suppressed during disposal.") : n, t.hasError = !0;
		}
		var r, i = 0;
		function a() {
			for (; r = t.stack.pop();) try {
				if (!r.async && i === 1) return i = 0, t.stack.push(r), Promise.resolve().then(a);
				if (r.dispose) {
					var e = r.dispose.call(r.value);
					if (r.async) return i |= 2, Promise.resolve(e).then(a, function(e) {
						return n(e), a();
					});
				} else i |= 1;
			} catch (e) {
				n(e);
			}
			if (i === 1) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
			if (t.hasError) throw t.error;
		}
		return a();
	};
})(typeof SuppressedError == "function" ? SuppressedError : function(e, t, n) {
	var r = Error(n);
	return r.name = "SuppressedError", r.error = e, r.suppressed = t, r;
}), Lc = class {
	constructor() {
		this._connectedTrack = null, this._closingPromise = null, this._closed = !1;
	}
	_ensureValidAdd() {
		if (!this._connectedTrack) throw Error("Source is not connected to an output track.");
		if (this._connectedTrack.output.state === "canceled") throw Error("Output has been canceled.");
		if (this._connectedTrack.output.state === "finalizing" || this._connectedTrack.output.state === "finalized") throw Error("Output has been finalized.");
		if (this._connectedTrack.output.state === "pending") throw Error("Output has not started.");
		if (this._closed) throw Error("Source is closed.");
	}
	async _start() {}
	async _flushAndClose(e) {}
	close() {
		if (this._closingPromise) return;
		let e = this._connectedTrack;
		if (!e) throw Error("Cannot call close without connecting the source to an output track.");
		if (e.output.state === "pending") throw Error("Cannot call close before output has been started.");
		this._closingPromise = (async () => {
			await this._flushAndClose(!1), this._closed = !0, e.output.state !== "finalizing" && e.output.state !== "finalized" && e.output._muxer.onTrackClose(e);
		})();
	}
	async _flushOrWaitForOngoingClose(e) {
		return this._closingPromise ??= (async () => {
			await this._flushAndClose(e), this._closed = !0;
		})();
	}
}, Rc = class extends Lc {
	constructor(e) {
		if (super(), this._connectedTrack = null, !kn.includes(e)) throw TypeError(`Invalid video codec '${e}'. Must be one of: ${kn.join(", ")}.`);
		this._codec = e;
	}
}, zc = (e, t) => {
	if (e.metadata.hasOnlyKeyPackets && t.type !== "key") throw Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.");
}, Bc = class {
	setError(e) {
		this.errorSet ||= (this.error = e, !0);
	}
	constructor(e, t) {
		this.source = e, this.encodingConfig = t, this.ensureEncoderPromise = null, this.encoderInitialized = !1, this.encoder = null, this.muxer = null, this.lastMultipleOfKeyFrameInterval = -1, this.emittedEncoderPackets = 0, this.codedWidth = null, this.codedHeight = null, this.outputWidth = null, this.outputHeight = null, this.frameRateLastSample = null, this.frameRateLastTimestamp = null, this.frameRateLastEndTimestamp = null, this.preciseTimings = [], this.customEncoder = null, this.customEncoderCallSerializer = new we(), this.customEncoderQueueSize = 0, this.defaultEncodeOptions = {}, this.alphaEncoder = null, this.splitter = null, this.splitterCreationFailed = !1, this.alphaFrameQueue = [], this.error = null, this.errorSet = !1, this.lastMuxerPromise = Promise.resolve(), this.closed = !1;
	}
	async add(e, n, r) {
		let i = e;
		try {
			this.checkForEncoderError(), this.source._ensureValidAdd();
			let a = this.encodingConfig, o = a.sizeChangeBehavior ?? "deny", s = !1;
			if (this.codedWidth !== null && this.codedHeight !== null) {
				if ((e.codedWidth !== this.codedWidth || e.codedHeight !== this.codedHeight) && (s = !0, o === "deny")) throw Error(`Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${e.codedWidth}x${e.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'deny' in the encoding options.`);
			} else this.codedWidth = e.codedWidth, this.codedHeight = e.codedHeight;
			if (a.transform?.width !== void 0 || a.transform?.height !== void 0 || a.transform?.rotate !== void 0 || a.transform?.crop !== void 0 || a.transform?.force === !0 || s && o !== "passThrough") {
				let r = a.transform?.width, i = a.transform?.height, c = a.transform?.fit ?? "fill";
				s && o !== "passThrough" && (t(this.outputWidth), t(this.outputHeight), t(o !== "deny"), r = this.outputWidth, i = this.outputHeight, c = o);
				let l = await e.transform({
					width: r,
					height: i,
					roundDimensionsTo: 2,
					crop: a.transform?.crop,
					rotate: a.transform?.rotate,
					fit: c,
					alpha: a.alpha
				});
				(this.outputWidth === null || this.outputHeight === null) && (this.outputWidth = l.displayWidth, this.outputHeight = l.displayHeight), n && e.close(), e = l, n = !0;
			} else (this.outputWidth === null || this.outputHeight === null) && (this.outputWidth = e.codedWidth, this.outputHeight = e.codedHeight);
			let c = a.transform?.frameRate;
			if (c !== void 0) {
				let t = e.timestamp + e.duration, a = he(e.timestamp, c);
				if (this.frameRateLastSample !== null) {
					if (a <= this.frameRateLastTimestamp) {
						this.frameRateLastSample.close(), this.frameRateLastSample = e.clone(), this.frameRateLastEndTimestamp = t;
						return;
					}
					await this.padFrameRate(a, r);
				}
				e === i && (e = e.clone(), n = !0), e.setTimestamp(a), e.setDuration(1 / c), this.frameRateLastSample?.close(), this.frameRateLastSample = e.clone(), this.frameRateLastTimestamp = a, this.frameRateLastEndTimestamp = t;
			}
			await this.processAndEncode(e, r);
		} finally {
			n && e.close();
		}
	}
	async processAndEncode(e, n) {
		let r = this.encodingConfig, i;
		if (r.transform?.process) {
			let t = r.transform.process(e);
			if (A(t) && (t = await t), t === null) return;
			Array.isArray(t) || (t = [t]);
			let n = [];
			try {
				for (let r of t) r instanceof Wo ? n.push(r) : typeof VideoFrame < "u" && r instanceof VideoFrame ? n.push(new Wo(r)) : n.push(new Wo(r, {
					timestamp: e.timestamp,
					duration: e.duration
				}));
			} catch (r) {
				for (let t of n) t !== e && t.close();
				for (let n of t) (n instanceof Wo && n !== e || typeof VideoFrame < "u" && n instanceof VideoFrame) && n.close();
				throw r;
			}
			i = n;
		} else i = [e];
		try {
			for (let e of i) {
				if (this.encoderInitialized || (this.ensureEncoderPromise || this.ensureEncoder(e), this.encoderInitialized || await this.ensureEncoderPromise), t(this.encoderInitialized), this.closed) break;
				let r = this.encodingConfig.keyFrameInterval ?? 2, i = Math.floor(e.timestamp / r), a = {
					...this.defaultEncodeOptions,
					...e.encodeOptions,
					...n
				}, o = {
					...a,
					keyFrame: a.keyFrame === void 0 ? r === 0 || i !== this.lastMultipleOfKeyFrameInterval : a.keyFrame
				};
				if (this.lastMultipleOfKeyFrameInterval = i, this.encodingConfig.onEncodedSample?.(e), this.customEncoder) {
					this.customEncoderQueueSize++;
					let t = e.clone(), n = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(t, o)).catch((e) => this.setError(e)).finally(() => {
						this.customEncoderQueueSize--, t.close();
					});
					this.customEncoderQueueSize >= 4 && await n;
				} else {
					t(this.encoder);
					let n = e.toVideoFrame(), r = O(this.preciseTimings, n.timestamp, (e) => e.microsecondTimestamp), i = r === -1 ? null : this.preciseTimings[r];
					if (i && i.microsecondTimestamp === n.timestamp ? (i.timestamp !== e.timestamp && (i.timestampIsValid = !1), i.duration !== e.duration && (i.durationIsValid = !1)) : (this.preciseTimings.splice(r + 1, 0, {
						microsecondTimestamp: n.timestamp,
						timestamp: e.timestamp,
						duration: e.duration,
						timestampIsValid: !0,
						durationIsValid: !0
					}), this.preciseTimings.length > 128 && this.preciseTimings.shift()), !this.alphaEncoder) try {
						this.encoder.encode(n, o);
					} finally {
						n.close();
					}
					else if (n.format && !n.format.includes("A") || this.splitterCreationFailed) {
						this.alphaFrameQueue.push(null);
						try {
							this.encoder.encode(n, o);
						} finally {
							n.close();
						}
					} else {
						this.splitter ||= new Hc();
						let { colorFrame: e, alphaFrame: t } = await this.splitter.split(n);
						this.alphaFrameQueue.push(t);
						try {
							this.encoder.encode(e, o);
						} finally {
							e.close();
						}
					}
					this.encoder.encodeQueueSize >= 4 && await new Promise((e) => this.encoder.addEventListener("dequeue", e, { once: !0 }));
				}
				await this.lastMuxerPromise;
			}
		} finally {
			for (let t of i) t !== e && t.close();
		}
	}
	async padFrameRate(e, n) {
		let r = this.encodingConfig.transform.frameRate;
		t(this.frameRateLastSample);
		let i = Math.round((e - this.frameRateLastTimestamp) * r);
		for (let e = 1; e < i; e++) {
			let t = {
				stack: [],
				error: void 0,
				hasError: !1
			};
			try {
				let i = Fc(t, this.frameRateLastSample.clone(), !1);
				i.setTimestamp(this.frameRateLastTimestamp + e / r), i.setDuration(1 / r), await this.processAndEncode(i, n);
			} catch (e) {
				t.error = e, t.hasError = !0;
			} finally {
				Ic(t);
			}
		}
	}
	ensureEncoder(e) {
		this.ensureEncoderPromise = (async () => {
			let n = gs(this.encodingConfig.quality, this.encodingConfig.bitrate);
			t(n !== void 0);
			let r = ls({
				...this.encodingConfig,
				quality: n,
				width: e.codedWidth,
				height: e.codedHeight,
				squarePixelWidth: e.squarePixelWidth,
				squarePixelHeight: e.squarePixelHeight,
				framerate: this.source._connectedTrack?.metadata.frameRate
			}), i = null, a;
			for (let e of r) {
				let t = e.config;
				if (this.encodingConfig.onEncoderConfig?.(t), a = ys.find((e) => e.supports(this.encodingConfig.codec, t)), a) {
					i = e;
					break;
				}
				if (!(typeof VideoEncoder > "u")) {
					if (t.alpha = "discard", this.encodingConfig.alpha === "keep" && (t.latencyMode = "quality"), (t.width % 2 == 1 || t.height % 2 == 1) && (this.encodingConfig.codec === "avc" || this.encodingConfig.codec === "hevc")) throw Error(`The dimensions ${t.width}x${t.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`);
					try {
						if ((await VideoEncoder.isConfigSupported(t)).supported) {
							i = e;
							break;
						}
					} catch {}
				}
			}
			if (!i) {
				if (typeof VideoEncoder > "u") throw Error(je("VideoEncoder"));
				let e = r[0].config, t = r.map(({ config: e, quantizer: t }) => t === null ? `${e.bitrate} bps` : `quantizer ${t}`);
				throw Error(`This specific encoder configuration (${e.codec}, ${t.join(" / ")}, ${e.width}x${e.height}, hardware acceleration: ${e.hardwareAcceleration ?? "no-preference"}) is not supported in this environment. Consider using another codec or changing your video parameters.`);
			}
			let o = i.config;
			if (i.quantizer !== null && (this.defaultEncodeOptions = hs(this.encodingConfig.codec, i.quantizer)), a) this.customEncoder = new a(), this.customEncoder.codec = this.encodingConfig.codec, this.customEncoder.config = o, this.customEncoder.onPacket = (e, t) => {
				if (!(e instanceof L)) throw TypeError("The first argument passed to onPacket must be an EncodedPacket.");
				if (t !== void 0 && (!t || typeof t != "object")) throw TypeError("The second argument passed to onPacket must be an object or undefined.");
				zc(this.source._connectedTrack, e), this.encodingConfig.onEncodedPacket?.(e, t), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, e, t).catch((e) => {
					this.setError(e);
				});
			}, this.customEncoder.onError = (e) => {
				this.setError(e);
			}, await this.customEncoder.init();
			else {
				let e = [], n = [], r = 0, i = 0, a = (e, t, n) => {
					let r = {};
					if (t) {
						let e = new Uint8Array(t.byteLength);
						t.copyTo(e), r.alpha = e;
					}
					let i = L.fromEncodedChunk(e, r), a = O(this.preciseTimings, e.timestamp, (e) => e.microsecondTimestamp), o = a === -1 ? null : this.preciseTimings[a], s = null;
					this.emittedEncoderPackets === 0 && i.type === "delta" && n?.decoderConfig && (s = Qt(this.encodingConfig.codec, n.decoderConfig, i.data)), (o && o.microsecondTimestamp === e.timestamp || s !== null) && (i = i.clone({
						timestamp: o?.timestampIsValid ? o.timestamp : void 0,
						duration: o?.durationIsValid ? o.duration : void 0,
						type: s ?? void 0
					})), zc(this.source._connectedTrack, i), this.encodingConfig.onEncodedPacket?.(i, n), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, i, n).catch((e) => {
						this.setError(e);
					}), this.emittedEncoderPackets++;
				}, s = (/* @__PURE__ */ Error("Encoding error")).stack;
				if (this.encoder = new VideoEncoder({
					output: (o, s) => {
						if (!this.alphaEncoder) {
							a(o, null, s);
							return;
						}
						let c = this.alphaFrameQueue.shift();
						t(c !== void 0), c ? (this.alphaEncoder.encode(c, {
							...this.defaultEncodeOptions,
							keyFrame: o.type === "key"
						}), i++, c.close(), e.push({
							chunk: o,
							meta: s
						})) : i === 0 ? a(o, null, s) : (n.push(r + i), e.push({
							chunk: o,
							meta: s
						}));
					},
					error: (e) => {
						e.stack = s, this.setError(e);
					}
				}), this.encoder.configure(o), this.encodingConfig.alpha === "keep") {
					let s = (/* @__PURE__ */ Error("Encoding error")).stack;
					this.alphaEncoder = new VideoEncoder({
						output: (o, s) => {
							i--;
							let c = e.shift();
							for (t(c !== void 0), a(c.chunk, o, c.meta), r++; n.length > 0 && n[0] === r;) {
								n.shift();
								let r = e.shift();
								t(r !== void 0), a(r.chunk, null, r.meta);
							}
						},
						error: (e) => {
							e.stack = s, this.setError(e);
						}
					}), this.alphaEncoder.configure(o);
				}
			}
			t(this.source._connectedTrack), this.muxer = this.source._connectedTrack.output._muxer, this.encoderInitialized = !0;
		})();
	}
	async flushAndClose(e) {
		try {
			if (!e && (this.checkForEncoderError(), this.frameRateLastSample)) {
				let e = this.encodingConfig.transform.frameRate, t = he(this.frameRateLastEndTimestamp, e);
				await this.padFrameRate(t);
			}
			this.closed = !0, e || (this.customEncoder ? this.customEncoderCallSerializer.call(() => this.customEncoder.flush()) : this.encoder && (await this.encoder.flush(), await this.alphaEncoder?.flush(), await Ke(25)));
		} finally {
			this.closed = !0, this.frameRateLastSample?.close(), this.frameRateLastSample = null, this.customEncoder ? await this.customEncoderCallSerializer.call(() => this.customEncoder.close()).catch((e) => this.setError(e)) : this.encoder && (this.encoder.state !== "closed" && this.encoder.close(), this.alphaEncoder && this.alphaEncoder.state !== "closed" && this.alphaEncoder.close(), this.alphaFrameQueue.forEach((e) => e?.close()), this.alphaFrameQueue.length = 0, this.splitter?.close());
		}
		e || this.checkForEncoderError();
	}
	getQueueSize() {
		return this.customEncoder ? this.customEncoderQueueSize : this.encoder?.encodeQueueSize ?? 0;
	}
	checkForEncoderError() {
		if (this.errorSet) throw this.error;
	}
}, Vc = null, Hc = class {
	constructor() {
		this.worker = null, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
	}
	split(e) {
		if (!this.worker) {
			if (!Vc) {
				let e = new Blob([`(${Uc.toString()})()`], { type: "application/javascript" });
				Vc = URL.createObjectURL(e);
			}
			this.worker = new Worker(Vc), this.worker.addEventListener("message", (e) => {
				let t = e.data, n = this.pendingRequests.get(t.id);
				n && (this.pendingRequests.delete(t.id), "error" in t ? n.reject(Error(t.error)) : n.resolve({
					colorFrame: t.colorFrame,
					alphaFrame: t.alphaFrame
				}));
			}), this.worker.addEventListener("error", (e) => {
				let t = Error(e.message || "Color/alpha splitter worker error.");
				for (let e of this.pendingRequests.values()) e.reject(t);
				this.pendingRequests.clear();
			});
		}
		let t = this.nextRequestId++, n = k();
		return this.pendingRequests.set(t, n), this.worker.postMessage({
			id: t,
			sourceFrame: e
		}, { transfer: [e] }), n.promise;
	}
	close() {
		this.worker?.terminate(), this.worker = null;
		let e = /* @__PURE__ */ Error("Color/alpha splitter closed.");
		for (let t of this.pendingRequests.values()) t.reject(e);
		this.pendingRequests.clear();
	}
}, Uc = () => {
	let e = null, t = Promise.resolve();
	self.addEventListener("message", (e) => {
		let { id: r, sourceFrame: i } = e.data;
		t = t.then(async () => {
			try {
				let { colorFrame: e, alphaFrame: t } = await n(i);
				self.postMessage({
					id: r,
					colorFrame: e,
					alphaFrame: t
				}, { transfer: [e, t] });
			} catch (e) {
				self.postMessage({
					id: r,
					error: e.message
				});
			} finally {
				i.close();
			}
		});
	});
	let n = async (t) => {
		let n = t.format;
		if (!n) throw Error("CPU color/alpha splitting requires a known VideoFrame format.");
		let a = t.allocationSize();
		if ((!e || e.byteLength !== a) && (e = new Uint8Array(a)), await t.copyTo(e), n === "RGBA" || n === "BGRA") return r(e, n, t);
		if (n === "I420A" || n === "I420AP10" || n === "I420AP12" || n === "I422A" || n === "I422AP10" || n === "I422AP12" || n === "I444A" || n === "I444AP10" || n === "I444AP12") return i(e, n, t);
		throw Error(`CPU color/alpha splitting does not support format '${n}'.`);
	}, r = (e, t, n) => {
		let r = n.visibleRect?.width ?? n.codedWidth, i = n.visibleRect?.height ?? n.codedHeight, a = r * i, o = a + Math.ceil(r / 2) * Math.ceil(i / 2) * 2, s = new Uint8Array(o);
		for (let t = 0, n = 3; t < a; t++, n += 4) s[t] = e[n];
		s.fill(128, a);
		let c = new VideoFrame(e, {
			format: t === "RGBA" ? "RGBX" : "BGRX",
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0
		}), l = {
			format: "I420",
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0,
			transfer: [s.buffer]
		};
		return {
			colorFrame: c,
			alphaFrame: new VideoFrame(s, l)
		};
	}, i = (e, t, n) => {
		let r = n.visibleRect?.width ?? n.codedWidth, i = n.visibleRect?.height ?? n.codedHeight, a = t.includes("P10"), o = t.includes("P12"), s = a || o ? 2 : 1, c, l;
		t.startsWith("I420") ? (c = Math.ceil(r / 2), l = Math.ceil(i / 2)) : t.startsWith("I422") ? (c = Math.ceil(r / 2), l = i) : (c = r, l = i);
		let u = r * i, d = c * l, f = u * s, p = d * s, m = u * s, h = f + p * 2, g = t.replace("A", ""), _ = Math.ceil(r / 2) * Math.ceil(i / 2), v = m + _ * s * 2, y = new Uint8Array(v), b = h;
		y.set(e.subarray(b, b + m), 0);
		let x = m, S = a ? 512 : o ? 2048 : 128;
		s === 1 ? y.fill(S, x) : new Uint16Array(y.buffer, x, 2 * _).fill(S);
		let C = a ? "I420P10" : o ? "I420P12" : "I420", w = new VideoFrame(e.subarray(0, h), {
			format: g,
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0
		}), T = {
			format: C,
			codedWidth: r,
			codedHeight: i,
			timestamp: n.timestamp,
			duration: n.duration ?? void 0,
			transfer: [y.buffer]
		};
		return {
			colorFrame: w,
			alphaFrame: new VideoFrame(y, T)
		};
	};
}, Wc = class extends Rc {
	constructor(e, t) {
		if (!(typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas < "u" && e instanceof OffscreenCanvas)) throw TypeError("canvas must be an HTMLCanvasElement or OffscreenCanvas.");
		ss(t), super(t.codec), this._encoder = new Bc(this, t), this._canvas = e;
	}
	add(e, t = 0, n) {
		if (!Number.isFinite(e) || e < 0) throw TypeError("timestamp must be a non-negative number.");
		if (!Number.isFinite(t) || t < 0) throw TypeError("duration must be a non-negative number.");
		let r = new Wo(this._canvas, {
			timestamp: e,
			duration: t
		});
		return this._encoder.add(r, !0, n);
	}
	_flushAndClose(e) {
		return this._encoder.flushAndClose(e);
	}
}, Gc = class extends Lc {
	constructor(e) {
		if (super(), this._connectedTrack = null, !Mn.includes(e)) throw TypeError(`Invalid audio codec '${e}'. Must be one of: ${Mn.join(", ")}.`);
		this._codec = e;
	}
}, Kc = class extends Lc {
	constructor(e) {
		if (super(), this._connectedTrack = null, !Nn.includes(e)) throw TypeError(`Invalid subtitle codec '${e}'. Must be one of: ${Nn.join(", ")}.`);
		this._codec = e;
	}
}, qc = class {
	getSupportedVideoCodecs() {
		return this.getSupportedCodecs().filter((e) => kn.includes(e));
	}
	getSupportedAudioCodecs() {
		return this.getSupportedCodecs().filter((e) => Mn.includes(e));
	}
	getSupportedSubtitleCodecs() {
		return this.getSupportedCodecs().filter((e) => Nn.includes(e));
	}
	_codecUnsupportedHint(e) {
		return "";
	}
	_isFragmentedIsobmff() {
		return !1;
	}
}, Jc = class extends qc {
	constructor(e = {}) {
		if (!e || typeof e != "object") throw TypeError("options must be an object.");
		if (e.appendOnly !== void 0 && typeof e.appendOnly != "boolean") throw TypeError("options.appendOnly, when provided, must be a boolean.");
		if (e.minimumClusterDuration !== void 0 && (!Be(e.minimumClusterDuration) || e.minimumClusterDuration < 0)) throw TypeError("options.minimumClusterDuration, when provided, must be a non-negative number.");
		if (e.onEbmlHeader !== void 0 && typeof e.onEbmlHeader != "function") throw TypeError("options.onEbmlHeader, when provided, must be a function.");
		if (e.onSegmentHeader !== void 0 && typeof e.onSegmentHeader != "function") throw TypeError("options.onHeader, when provided, must be a function.");
		if (e.onCluster !== void 0 && typeof e.onCluster != "function") throw TypeError("options.onCluster, when provided, must be a function.");
		super(), this._options = e;
	}
	_createMuxer(e) {
		return new Pc(e, this);
	}
	get _name() {
		return "Matroska";
	}
	getSupportedTrackCounts() {
		return {
			video: {
				min: 0,
				max: 127
			},
			audio: {
				min: 0,
				max: 127
			},
			subtitle: {
				min: 0,
				max: 127
			},
			total: {
				min: 0,
				max: 127
			}
		};
	}
	get fileExtension() {
		return ".mkv";
	}
	get mimeType() {
		return "video/x-matroska";
	}
	getSupportedCodecs() {
		return [
			...kn,
			...jn,
			...An.filter((e) => ![
				"pcm-s8",
				"pcm-f32be",
				"pcm-f64be",
				"ulaw",
				"alaw"
			].includes(e)),
			...Nn
		];
	}
	get supportsVideoRotationMetadata() {
		return !1;
	}
	get supportsTimestampedMediaData() {
		return !0;
	}
}, Yc = class extends Jc {
	constructor(e) {
		super(e);
	}
	getSupportedCodecs() {
		return [
			...kn.filter((e) => [
				"vp8",
				"vp9",
				"av1"
			].includes(e)),
			...Mn.filter((e) => ["opus", "vorbis"].includes(e)),
			...Nn
		];
	}
	get _name() {
		return "WebM";
	}
	get fileExtension() {
		return ".webm";
	}
	get mimeType() {
		return "video/webm";
	}
	_codecUnsupportedHint(e) {
		return new Jc().getSupportedCodecs().includes(e) ? " Switching to MKV will grant support for this codec." : "";
	}
}, Xc = [
	"video",
	"audio",
	"subtitle"
], Zc = class e {
	constructor(e, t, n, r, i) {
		this.id = e, this.output = t, this.type = n, this.source = r, this.metadata = i;
	}
	isVideoTrack() {
		return this.type === "video";
	}
	isAudioTrack() {
		return this.type === "audio";
	}
	isSubtitleTrack() {
		return this.type === "subtitle";
	}
	canBePairedWith(t) {
		if (!(t instanceof e)) throw TypeError("other must be an OutputTrack.");
		if (this === t) return !1;
		let n = qe(this.metadata.group), r = qe(t.metadata.group);
		for (let e of n) if (this.type !== t.type && r.some((t) => e === t) || r.some((t) => e._pairedGroups.has(t))) return !0;
		return !1;
	}
}, Qc = class extends Zc {
	constructor(e, t, n, r) {
		super(e, t, "video", n, r);
	}
}, $c = class extends Zc {
	constructor(e, t, n, r) {
		super(e, t, "audio", n, r);
	}
}, el = class extends Zc {
	constructor(e, t, n, r) {
		super(e, t, "subtitle", n, r);
	}
}, tl = class e {
	constructor() {
		this._pairedGroups = /* @__PURE__ */ new Set();
	}
	pairWith(t) {
		if (!(t instanceof e)) throw TypeError("other must be an OutputTrackGroup.");
		if (this === t) throw TypeError("Cannot pair a group with itself.");
		this._pairedGroups.add(t), t._pairedGroups.add(this);
	}
}, nl = (e) => {
	if (!e || typeof e != "object") throw TypeError("metadata must be an object.");
	if (e.languageCode !== void 0 && !ye(e.languageCode)) throw TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
	if (e.name !== void 0 && typeof e.name != "string") throw TypeError("metadata.name, when provided, must be a string.");
	if (e.disposition !== void 0 && tt(e.disposition), e.maximumPacketCount !== void 0 && (!Number.isInteger(e.maximumPacketCount) || e.maximumPacketCount < 0)) throw TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
	if (e.group !== void 0 && !(e.group instanceof tl) && (!Array.isArray(e.group) || e.group.some((e) => !(e instanceof tl)))) throw TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.");
}, rl = class extends Je {
	get target() {
		let e = "Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";
		if (this._rootTargetPromise) throw TypeError(e);
		let t = this._getRootTarget();
		if (A(t)) throw TypeError(e);
		return t;
	}
	constructor(e) {
		if (super(), this.state = "pending", this.defaultTrackGroup = new tl(), this.tracks = [], this._onFinalize = null, this._unfinalizedTargets = /* @__PURE__ */ new Set(), this._rootWriterPromise = null, this._startPromise = null, this._cancelPromise = null, this._finalizePromise = null, this._mutex = new S(), this._metadataTags = {}, this._rootTarget = null, this._rootTargetPromise = null, this._firstMediaStreamTimestamp = null, !e || typeof e != "object") throw TypeError("options must be an object.");
		if (!(e.format instanceof qc)) throw TypeError("options.format must be an OutputFormat.");
		if (!(e.target instanceof Sc || e.target instanceof Dc)) throw TypeError("options.target must be a Target or a PathedTarget.");
		if (e.target instanceof Sc && this._rememberTarget(e.target), e.initTarget !== void 0 && !(e.initTarget instanceof Sc) && typeof e.initTarget != "function") throw Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");
		if (e.onFinalize !== void 0 && typeof e.onFinalize != "function") throw TypeError("options.onFinalize, when provided, must be a function.");
		this.format = e.format, this._target = e.target, this._onFinalize = e.onFinalize ?? null, this._initTarget = e.initTarget ?? null, this._initTarget instanceof Sc && this._rememberTarget(this._initTarget), this._muxer = e.format._createMuxer(this);
	}
	_getTargetValidated(e) {
		t(this._target instanceof Dc);
		let n = this._target.getTarget(e), r = (e) => {
			if (!(e instanceof Sc)) throw TypeError("getTarget must return a Target.");
			return e;
		};
		return A(n) ? n.then(r) : r(n);
	}
	async _getTarget(e) {
		t(this._target instanceof Dc);
		let n = await this._getTargetValidated(e);
		return this._emit("target", {
			target: n,
			request: e,
			isRoot: e.isRoot
		}), this.state === "canceled" ? await n._close() : this._rememberTarget(n), n;
	}
	_rememberTarget(e) {
		this._unfinalizedTargets.add(e), e.on("finalized", () => this._unfinalizedTargets.delete(e), { once: !0 });
	}
	async _getInitTarget() {
		if (t(this._initTarget !== null), this._initTarget instanceof Sc) return this._initTarget;
		let e = await this._initTarget();
		return this.state === "canceled" ? await e._close() : this._rememberTarget(e), e;
	}
	_hasInitTarget() {
		return this._initTarget !== null;
	}
	_getRootTarget() {
		if (this._rootTarget) return this._rootTarget;
		if (this._rootTargetPromise) return this._rootTargetPromise;
		if (this._target instanceof Sc) return this._emit("target", {
			target: this._target,
			request: null,
			isRoot: !0
		}), this._rootTarget = this._target, this._target;
		let e = {
			path: this._target.rootPath,
			isRoot: !0,
			mimeType: this.format.mimeType
		}, t = this._getTargetValidated(e), n = (t) => (this.state === "canceled" ? t._close() : this._rememberTarget(t), this._emit("target", {
			target: t,
			request: e,
			isRoot: !0
		}), this._rootTarget = t, t);
		return A(t) ? this._rootTargetPromise = t.then(n) : n(t);
	}
	_getRootWriter(e) {
		return this._rootWriterPromise ??= (async () => {
			let t = await this._getRootTarget(), n = new xc(t, typeof e == "boolean" ? e : e(t));
			return n.start(), n;
		})();
	}
	addVideoTrack(e, t = {}) {
		if (!(e instanceof Rc)) throw TypeError("source must be a VideoSource.");
		if (nl(t), t.rotation !== void 0 && ![
			0,
			90,
			180,
			270
		].includes(t.rotation)) throw TypeError(`Invalid video rotation: ${t.rotation}. Has to be 0, 90, 180 or 270.`);
		if (!this.format.supportsVideoRotationMetadata && t.rotation) throw Error(`${this.format._name} does not support video rotation metadata.`);
		if (t.frameRate !== void 0 && (!Number.isFinite(t.frameRate) || t.frameRate <= 0)) throw TypeError(`Invalid video frame rate: ${t.frameRate}. Must be a positive number.`);
		if (t.decoderConfig !== void 0 && ar({ decoderConfig: t.decoderConfig }, e._codec), t.primingPacket !== void 0) {
			if (!(t.primingPacket instanceof L)) throw TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");
			if (t.decoderConfig === void 0) throw TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.");
		}
		let n = { ...t };
		return n.group ??= this.defaultTrackGroup, this._addTrack(new Qc(this.tracks.length + 1, this, e, n));
	}
	addAudioTrack(e, t = {}) {
		if (!(e instanceof Gc)) throw TypeError("source must be an AudioSource.");
		if (nl(t), t.decoderConfig !== void 0 && sr({ decoderConfig: t.decoderConfig }, e._codec), t.primingPacket !== void 0) {
			if (!(t.primingPacket instanceof L)) throw TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");
			if (t.decoderConfig === void 0) throw TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.");
		}
		let n = { ...t };
		return n.group ??= this.defaultTrackGroup, this._addTrack(new $c(this.tracks.length + 1, this, e, n));
	}
	addSubtitleTrack(e, t = {}) {
		if (!(e instanceof Kc)) throw TypeError("source must be a SubtitleSource.");
		nl(t);
		let n = { ...t };
		return n.group ??= this.defaultTrackGroup, this._addTrack(new el(this.tracks.length + 1, this, e, n));
	}
	setMetadataTags(e) {
		if ($e(e), this.state !== "pending") throw Error("Cannot set metadata tags after output has been started or canceled.");
		this._metadataTags = e;
	}
	_addTrack(e) {
		if (this.state !== "pending") throw Error("Cannot add track after output has been started or canceled.");
		if (e.source._connectedTrack) throw Error("Source is already used for a track.");
		let t = this.format.getSupportedTrackCounts(), n = this.tracks.reduce((t, n) => t + +(n.type === e.type), 0), r = t[e.type].max;
		if (n === r) throw Error(r === 0 ? `${this.format._name} does not support ${e.type} tracks.` : `${this.format._name} does not support more than ${r} ${e.type} track${r === 1 ? "" : "s"}.`);
		let i = t.total.max;
		if (this.tracks.length === i) throw Error(`${this.format._name} does not support more than ${i} tracks${i === 1 ? "" : "s"} in total.`);
		if (e.isVideoTrack()) {
			let t = this.format.getSupportedVideoCodecs();
			if (t.length === 0) throw Error(`${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(e.source._codec));
			if (!t.includes(e.source._codec)) throw Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
		} else if (e.isAudioTrack()) {
			let t = this.format.getSupportedAudioCodecs();
			if (t.length === 0) throw Error(`${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(e.source._codec));
			if (!t.includes(e.source._codec)) throw Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
		} else if (e.isSubtitleTrack()) {
			let t = this.format.getSupportedSubtitleCodecs();
			if (t.length === 0) throw Error(`${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(e.source._codec));
			if (!t.includes(e.source._codec)) throw Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
		}
		return this.tracks.push(e), e.source._connectedTrack = e, e;
	}
	hasEnoughTracks() {
		let e = this.format.getSupportedTrackCounts();
		for (let t of Xc) if (this.tracks.reduce((e, n) => e + +(n.type === t), 0) < e[t].min) return !1;
		let t = e.total.min;
		return !(this.tracks.length < t);
	}
	async start() {
		let e = this.format.getSupportedTrackCounts();
		for (let t of Xc) {
			let n = this.tracks.reduce((e, n) => e + +(n.type === t), 0), r = e[t].min;
			if (n < r) throw Error(r === e[t].max ? `${this.format._name} requires exactly ${r} ${t} track${r === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${r} ${t} track${r === 1 ? "" : "s"}.`);
		}
		let t = e.total.min;
		if (this.tracks.length < t) throw Error(t === e.total.max ? `${this.format._name} requires exactly ${t} track${t === 1 ? "" : "s"}.` : `${this.format._name} requires at least ${t} track${t === 1 ? "" : "s"}.`);
		if (this.state === "canceled") throw Error("Output has been canceled.");
		return this._startPromise ? (j._warn("Output has already been started."), this._startPromise) : this._startPromise = (async () => {
			this.state = "started";
			let e = this._mutex.acquire();
			try {
				await this._muxer.start();
				let e = this.tracks.map((e) => e.source._start());
				await Promise.all(e);
			} finally {
				(await e)();
			}
		})();
	}
	getMimeType() {
		return this._muxer.getMimeType();
	}
	async cancel() {
		if (this._cancelPromise) return j._warn("Output has already been canceled."), this._cancelPromise;
		if (this.state === "finalizing" || this.state === "finalized") {
			this.state === "finalized" && j._warn("Output has already been finalized.");
			return;
		}
		return this._cancelPromise = (async () => {
			this.state = "canceled";
			let e = await this._mutex.acquire();
			try {
				let e = this.tracks.map((e) => e.source._flushOrWaitForOngoingClose(!0));
				await Promise.all(e), await Promise.all([...this._unfinalizedTargets].map((e) => e._close())), this._unfinalizedTargets.clear();
			} finally {
				e();
			}
		})();
	}
	async finalize() {
		if (this.state === "pending") throw Error("Cannot finalize before starting.");
		if (this.state === "canceled") throw Error("Cannot finalize after canceling.");
		return this._finalizePromise ? (j._warn("Output has already been finalized."), this._finalizePromise) : this._finalizePromise = (async () => {
			this.state = "finalizing";
			let e = await this._mutex.acquire();
			try {
				let e = this.tracks.map((e) => e.source._flushOrWaitForOngoingClose(!1));
				if (await Promise.all(e), await this._muxer.finalize(), this._rootWriterPromise) {
					let e = await this._rootWriterPromise;
					e.finalized || (await e.flush(), await e.finalize());
				}
				this._onFinalize && await this._onFinalize(), this.state = "finalized";
			} finally {
				await Promise.all([...this._unfinalizedTargets].map((e) => e._close().catch(() => {}))), this._unfinalizedTargets.clear(), e();
			}
		})();
	}
}, il = /* @__PURE__ */ new Map(), al = "/";
function ol(e) {
	al = e.endsWith("/") ? e : `${e}/`;
}
function sl(e) {
	let t = il.get(e);
	return t || (t = new Image(), t.decoding = "async", t.src = al + e.replace(/^\//, ""), il.set(e, t)), t;
}
function cl(e) {
	if (typeof Image > "u") return null;
	let t = sl(e);
	return t.complete && t.naturalWidth > 0 ? t : null;
}
function ll(e) {
	return typeof Image > "u" ? Promise.resolve() : Promise.all((e || []).map((e) => sl(e).decode().catch(() => null)));
}
//#endregion
//#region src/fx/core/params.js
var ul = [
	"range",
	"toggle",
	"color",
	"select",
	"seed"
];
function dl(e, t) {
	let n = Number(e);
	return Number.isFinite(n) ? n : t;
}
function fl(e) {
	let t = /^#?([0-9a-f]{6})$/i.exec(String(e || "").trim());
	if (!t) return [
		1,
		1,
		1
	];
	let n = parseInt(t[1], 16);
	return [
		(n >> 16 & 255) / 255,
		(n >> 8 & 255) / 255,
		(n & 255) / 255
	];
}
function pl(e, t) {
	let n = {
		...t,
		id: e
	};
	if (!ul.includes(n.type)) throw Error(`Parámetro ${e}: tipo desconocido ${n.type}`);
	if (n.label = String(n.label || e), n.type === "range") n.min = dl(n.min, 0), n.max = dl(n.max, 1), n.step = dl(n.step, (n.max - n.min) / 100), n.def = Math.min(n.max, Math.max(n.min, dl(n.def, n.min)));
	else if (n.type === "toggle") n.def = !!n.def;
	else if (n.type === "color") n.def = /^#[0-9a-f]{6}$/i.test(n.def || "") ? n.def.toLowerCase() : "#ffffff";
	else if (n.type === "select") {
		if (n.options = (n.options || []).map((e) => typeof e == "string" ? {
			id: e,
			label: e
		} : {
			id: String(e.id),
			label: String(e.label || e.id)
		}), !n.options.length) throw Error(`Parámetro ${e}: select sin opciones`);
		n.def = n.options.some((e) => e.id === n.def) ? n.def : n.options[0].id;
	} else n.type === "seed" && (n.def = Math.round(dl(n.def, 1)));
	return n;
}
function ml(e, t) {
	if (t == null) return e.def;
	if (e.type === "range") {
		let n = dl(t, e.def);
		return Math.min(e.max, Math.max(e.min, n));
	}
	return e.type === "toggle" ? t === !0 || t === 1 || t === "true" : e.type === "color" ? /^#[0-9a-f]{6}$/i.test(String(t)) ? String(t).toLowerCase() : e.def : e.type === "select" ? e.options.some((e) => e.id === String(t)) ? String(t) : e.def : e.type === "seed" ? Math.round(dl(t, e.def)) : e.def;
}
function hl(e, t) {
	let n = {};
	for (let r of e.paramList) n[r.id] = ml(r, t?.[r.id]);
	return n;
}
function gl(e, t) {
	return e.type === "color" ? fl(t) : e.type === "toggle" ? +!!t : e.type === "select" ? Math.max(0, e.options.findIndex((e) => e.id === t)) : Number(t) || 0;
}
//#endregion
//#region src/fx/core/gl.js
var _l = "#version 300 es\nin vec2 aPos;\nout vec2 vUv;\nvoid main() {\n  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);\n  gl_Position = vec4(aPos, 0.0, 1.0);\n}", vl = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\nuniform sampler2D uSrc;\nuniform vec4 uSrcRect;   // contenido dentro de la textura de entrada (uv): x0, y0, x1, y1\nuniform vec2 uRes;       // px del lienzo de salida (con margen)\nuniform vec4 uContent;   // contenido dentro del lienzo de salida (uv): x0, y0, x1, y1\nuniform float uTime;     // s desde el inicio del efecto\nuniform float uDur;      // s que dura el efecto en el clip\nuniform float uProgress; // uTime / uDur (0-1)\nuniform float uFrame;    // fotograma (a 30 fps) desde el inicio del efecto\nuniform float uSeed;\n#define PI 3.14159265359\n#define TAU 6.28318530718\nvec2 contentPx() { return uRes * (uContent.zw - uContent.xy); }\nfloat minSide() { vec2 c = contentPx(); return min(c.x, c.y); }\nvec4 src(vec2 uv) {\n  vec2 t = mix(uSrcRect.xy, uSrcRect.zw, uv);\n  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return vec4(0.0);\n  return texture(uSrc, t);\n}\n// Repite la imagen en espejo fuera de 0-1 (sin huecos al desplazar o girar).\nvec2 mirrorUv(vec2 p) { p = abs(mod(p, 2.0)); return mix(p, 2.0 - p, step(1.0, p)); }\nvec2 aspect() { return contentPx() / minSide(); }\nvec2 onePx() { return 1.0 / contentPx(); }\nvec4 straight(vec4 c) { return c.a > 1e-5 ? vec4(c.rgb / c.a, c.a) : vec4(0.0); }\nvec4 premul(vec4 c) { return vec4(c.rgb * c.a, c.a); }\nfloat luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }\nfloat hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }\nfloat hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }\nvec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }\nfloat noise(vec2 p) {\n  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);\n  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);\n}\nfloat fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }\nvec3 rgb2hsv(vec3 c) {\n  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\n  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\n  float d = q.x - min(q.w, q.y);\n  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);\n}\nvec3 hsv2rgb(vec3 c) {\n  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);\n  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);\n}\n", yl = "\nvoid main() {\n  vec2 uv = (vUv - uContent.xy) / (uContent.zw - uContent.xy);\n  outColor = clamp(effect(uv), 0.0, 1.0);\n}", bl = null;
function xl(e, t, n, r) {
	let i = e.createShader(t);
	if (e.shaderSource(i, n), e.compileShader(i), !e.getShaderParameter(i, e.COMPILE_STATUS)) {
		let t = e.getShaderInfoLog(i);
		throw e.deleteShader(i), Error(`Shader ${r}: ${t}`);
	}
	return i;
}
function Sl() {
	if (bl) return bl;
	if (typeof document > "u") return null;
	let e = document.createElement("canvas");
	e.width = 2, e.height = 2;
	let t = e.getContext("webgl2", {
		alpha: !0,
		premultipliedAlpha: !0,
		preserveDrawingBuffer: !0,
		antialias: !1
	});
	if (!t) return null;
	let n = t.createBuffer();
	t.bindBuffer(t.ARRAY_BUFFER, n), t.bufferData(t.ARRAY_BUFFER, new Float32Array([
		-1,
		-1,
		1,
		-1,
		-1,
		1,
		1,
		1
	]), t.STATIC_DRAW);
	let r = t.createTexture();
	return t.bindTexture(t.TEXTURE_2D, r), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MIN_FILTER, t.LINEAR), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_MAG_FILTER, t.LINEAR), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_S, t.CLAMP_TO_EDGE), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_T, t.CLAMP_TO_EDGE), t.pixelStorei(t.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0), t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL, !1), e.addEventListener?.("webglcontextlost", (e) => {
		e.preventDefault(), bl = null;
	}), bl = {
		canvas: e,
		gl: t,
		buf: n,
		tex: r,
		programs: /* @__PURE__ */ new Map()
	}, bl;
}
function Cl(e, t) {
	let n = `${t.id}@${t.v}`, r = e.programs.get(n);
	if (r) return r;
	let { gl: i } = e, a = xl(i, i.VERTEX_SHADER, _l, `${t.id}.vert`), o = xl(i, i.FRAGMENT_SHADER, vl + t.frag + yl, t.id), s = i.createProgram();
	if (i.attachShader(s, a), i.attachShader(s, o), i.linkProgram(s), !i.getProgramParameter(s, i.LINK_STATUS)) throw Error(`Shader ${t.id}: ${i.getProgramInfoLog(s)}`);
	let c = {}, l = i.getProgramParameter(s, i.ACTIVE_UNIFORMS);
	for (let e = 0; e < l; e++) {
		let t = i.getActiveUniform(s, e);
		c[t.name] = i.getUniformLocation(s, t.name);
	}
	return r = {
		prog: s,
		uniforms: c,
		aPos: i.getAttribLocation(s, "aPos")
	}, e.programs.set(n, r), r;
}
function wl(e, t, { cw: n, ch: r, srcRect: i, content: a, time: o, dur: s, frame: c, seed: l, params: u }) {
	let d = Sl();
	if (!d) return null;
	let { gl: f, canvas: p } = d;
	(p.width !== n || p.height !== r) && (p.width = n, p.height = r);
	let m = Cl(d, e);
	f.viewport(0, 0, n, r), f.useProgram(m.prog), f.bindBuffer(f.ARRAY_BUFFER, d.buf), f.enableVertexAttribArray(m.aPos), f.vertexAttribPointer(m.aPos, 2, f.FLOAT, !1, 0, 0), f.activeTexture(f.TEXTURE0), f.bindTexture(f.TEXTURE_2D, d.tex), f.texImage2D(f.TEXTURE_2D, 0, f.RGBA, f.RGBA, f.UNSIGNED_BYTE, t);
	let h = m.uniforms;
	h.uSrc && f.uniform1i(h.uSrc, 0), h.uSrcRect && f.uniform4f(h.uSrcRect, ...i), h.uRes && f.uniform2f(h.uRes, n, r), h.uContent && f.uniform4f(h.uContent, ...a), h.uTime && f.uniform1f(h.uTime, o), h.uDur && f.uniform1f(h.uDur, s), h.uProgress && f.uniform1f(h.uProgress, s > 0 ? Math.min(1, Math.max(0, o / s)) : 0), h.uFrame && f.uniform1f(h.uFrame, c), h.uSeed && f.uniform1f(h.uSeed, l);
	for (let t of e.paramList) {
		let e = h[`u_${t.id}`];
		if (!e) continue;
		let n = gl(t, ml(t, u?.[t.id]));
		Array.isArray(n) ? f.uniform3f(e, n[0], n[1], n[2]) : f.uniform1f(e, n);
	}
	return f.clearColor(0, 0, 0, 0), f.clear(f.COLOR_BUFFER_BIT), f.drawArrays(f.TRIANGLE_STRIP, 0, 4), p;
}
function Tl(e) {
	let t = Sl();
	return t ? (Cl(t, e), !0) : !1;
}
//#endregion
//#region src/lib/lruBytes.js
var El = /* @__PURE__ */ new Map();
function Dl(e) {
	if (!e) return 0;
	let t = e.width || e.naturalWidth || e.videoWidth || e.displayWidth || 0, n = e.height || e.naturalHeight || e.videoHeight || e.displayHeight || 0;
	return Math.max(0, t * n * 4);
}
function Ol({ maxBytes: e = 67108864, onEvict: t = null, name: n = "" } = {}) {
	let r = /* @__PURE__ */ new Map(), i = 0;
	function a(e, n, a) {
		if (r.delete(e), i -= n.bytes, a && t) try {
			t(e, n.value);
		} catch {}
	}
	function o(t) {
		for (let [n, o] of r) {
			if (i <= e) break;
			n !== t && a(n, o, !0);
		}
	}
	let s = {
		get(e) {
			let t = r.get(e);
			if (t) return r.delete(e), r.set(e, t), t.value;
		},
		peek(e) {
			return r.get(e)?.value;
		},
		has(e) {
			return r.has(e);
		},
		set(e, t, n = 0) {
			let s = r.get(e);
			s && a(e, s, s.value !== t);
			let c = Math.max(0, Number(n) || 0);
			return r.set(e, {
				value: t,
				bytes: c
			}), i += c, o(e), t;
		},
		resize(e, t) {
			let n = r.get(e);
			if (!n) return;
			let a = Math.max(0, Number(t) || 0);
			i += a - n.bytes, n.bytes = a, o(e);
		},
		delete(e) {
			let t = r.get(e);
			t && a(e, t, !0);
		},
		purge(e) {
			for (let [t, n] of [...r]) e(t, n.value) || a(t, n, !0);
		},
		clear() {
			for (let [e, t] of [...r]) a(e, t, !0);
		},
		keys() {
			return [...r.keys()];
		},
		get size() {
			return r.size;
		},
		get bytes() {
			return i;
		},
		get maxBytes() {
			return e;
		}
	};
	return n && El.set(n, s), s;
}
//#endregion
//#region src/fx/core/define.js
var kl = [
	{
		id: "basic",
		label: "Básicos",
		icon: "auto_awesome"
	},
	{
		id: "glitch",
		label: "Glitch",
		icon: "broken_image"
	},
	{
		id: "retro",
		label: "Retro",
		icon: "videocam"
	},
	{
		id: "distort",
		label: "Distorsión",
		icon: "waves"
	},
	{
		id: "light",
		label: "Luz",
		icon: "flare"
	},
	{
		id: "lens",
		label: "Lente",
		icon: "camera"
	},
	{
		id: "motion",
		label: "Movimiento",
		icon: "vibration"
	},
	{
		id: "style",
		label: "Estilo",
		icon: "brush"
	},
	{
		id: "color",
		label: "Color",
		icon: "palette"
	}
], Al = [
	"shader",
	"canvas",
	"generator"
], jl = /^[a-z][a-z0-9_]*$/;
function $(e) {
	if (!e || !jl.test(e.id || "")) throw Error(`Efecto con id inválido: ${e?.id}`);
	if (!Al.includes(e.engine)) throw Error(`${e.id}: motor desconocido ${e.engine}`);
	if (!kl.some((t) => t.id === e.category)) throw Error(`${e.id}: categoría desconocida ${e.category}`);
	if (e.engine === "shader" && typeof e.frag != "string") throw Error(`${e.id}: falta frag`);
	if (e.engine !== "shader" && typeof e.render != "function") throw Error(`${e.id}: falta render`);
	let t = Object.entries(e.params || {}).map(([e, t]) => pl(e, t));
	return Object.freeze({
		...e,
		v: Math.max(1, Math.round(Number(e.v) || 1)),
		name: String(e.name || e.id),
		description: String(e.description || ""),
		tags: [...e.tags || []],
		pad: Math.min(.5, Math.max(0, Number(e.pad) || 0)),
		defaultDur: e.defaultDur == null ? null : Math.max(.1, Number(e.defaultDur)),
		paramList: t,
		params: Object.fromEntries(t.map((e) => [e.id, e]))
	});
}
//#endregion
//#region src/fx/effects/glitch.js
var Ml = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: .6,
	label: "Intensidad"
}, Nl = {
	type: "range",
	min: .1,
	max: 4,
	step: .1,
	def: 1,
	label: "Velocidad"
}, Pl = {
	type: "seed",
	def: 1,
	label: "Variación"
}, Fl = [
	$({
		id: "glitch_rgb",
		name: "Glitch RGB",
		description: "Canales de color separados a golpes, con cortes horizontales.",
		category: "glitch",
		engine: "shader",
		tags: [
			"glitch",
			"rgb",
			"digital",
			"error",
			"aberración"
		],
		params: {
			amount: Ml,
			speed: Nl,
			seed: Pl
		},
		frag: "\nuniform float u_amount; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  float t = floor(uTime * 12.0 * u_speed);\n  float burst = step(0.55, hash11(t + uSeed * 7.13));\n  float k = u_amount * (0.004 + 0.03 * burst * hash11(t * 1.7 + uSeed));\n  float row = floor(uv.y * 24.0);\n  float shift = (hash12(vec2(row, t + uSeed)) - 0.5) * 0.08 * u_amount * burst;\n  vec2 p = uv + vec2(shift, 0.0);\n  vec4 c = src(p);\n  vec4 r = src(p + vec2(k, 0.0));\n  vec4 b = src(p - vec2(k, 0.0));\n  return vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));\n}"
	}),
	$({
		id: "glitch_blocks",
		name: "Bloques",
		description: "Bloques de imagen que saltan de sitio, como un vídeo corrupto.",
		category: "glitch",
		engine: "shader",
		tags: [
			"glitch",
			"bloques",
			"datamosh",
			"corrupto"
		],
		params: {
			amount: Ml,
			speed: Nl,
			size: {
				type: "range",
				min: .02,
				max: .2,
				step: .01,
				def: .06,
				label: "Tamaño"
			},
			seed: Pl
		},
		frag: "\nuniform float u_amount; uniform float u_speed; uniform float u_size;\nvec4 effect(vec2 uv) {\n  float t = floor(uTime * 10.0 * u_speed);\n  vec2 cell = floor(uv / vec2(u_size * 3.0, u_size));\n  float r = hash12(cell + vec2(t * 13.1, uSeed));\n  float on = step(1.0 - 0.35 * u_amount, r);\n  vec2 off = (hash22(cell + vec2(t, uSeed * 3.0)) - 0.5) * vec2(0.2, 0.02) * u_amount * on;\n  vec4 c = src(uv + off);\n  if (on > 0.5) {\n    vec4 c2 = src(uv + off * 1.6);\n    c = vec4(c2.r, c.g, c.b, max(c.a, c2.a));\n  }\n  return c;\n}"
	}),
	$({
		id: "glitch_tear",
		name: "Interferencia",
		description: "Una franja que recorre la imagen desgarrándola en horizontal.",
		category: "glitch",
		engine: "shader",
		tags: [
			"glitch",
			"interferencia",
			"señal",
			"tv"
		],
		params: {
			amount: Ml,
			speed: Nl,
			seed: Pl
		},
		frag: "\nuniform float u_amount; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  float t = uTime * u_speed;\n  float y = fract(t * 0.35 + uSeed * 0.13);\n  float bar = smoothstep(0.12, 0.0, abs(uv.y - y));\n  float jitter = (hash12(vec2(floor(uv.y * 200.0), floor(t * 30.0))) - 0.5) * 0.02 * u_amount;\n  vec2 p = uv + vec2(jitter + bar * 0.06 * u_amount * sin(uv.y * 80.0 + t * 20.0), 0.0);\n  vec4 c = src(p);\n  float n = hash12(uv * uRes + uFrame) * bar * u_amount;\n  c.rgb = min(c.rgb + n * 0.5 * c.a, vec3(c.a));\n  return c;\n}"
	}),
	$({
		id: "tv_static",
		name: "Estática",
		description: "Ruido de televisión sin señal, continuo o a ráfagas.",
		category: "glitch",
		engine: "shader",
		tags: [
			"ruido",
			"estática",
			"tv",
			"nieve"
		],
		params: {
			amount: {
				...Ml,
				def: .5
			},
			bursts: {
				type: "toggle",
				def: !0,
				label: "A ráfagas"
			},
			seed: Pl
		},
		frag: "\nuniform float u_amount; uniform float u_bursts;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float t = floor(uFrame / 2.0);\n  float on = u_bursts > 0.5 ? step(0.6, hash11(t * 3.3 + uSeed)) : 1.0;\n  float n = hash12(floor(uv * contentPx() / 2.0) + vec2(uFrame * 17.0, uSeed));\n  return vec4(mix(c.rgb, vec3(n) * c.a, u_amount * on), c.a);\n}"
	}),
	$({
		id: "pixel_drift",
		name: "Arrastre de píxeles",
		description: "Las zonas claras se estiran hacia abajo, como un pixel sort.",
		category: "glitch",
		engine: "shader",
		tags: [
			"pixel sort",
			"arrastre",
			"glitch",
			"derretir"
		],
		params: {
			amount: Ml,
			threshold: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .6,
				label: "Umbral"
			},
			speed: Nl
		},
		frag: "\nuniform float u_amount; uniform float u_threshold; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float len = u_amount * 0.25 * (0.6 + 0.4 * sin(uTime * u_speed * 2.0 + uv.x * 9.0));\n  vec4 best = c;\n  float bl = luma(straight(c).rgb);\n  for (int i = 1; i <= 24; i++) {\n    vec4 s = src(uv - vec2(0.0, len * float(i) / 24.0));\n    float l = luma(straight(s).rgb);\n    if (l > u_threshold && l > bl) { best = s; bl = l; }\n  }\n  return best;\n}"
	})
], Il = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: .7,
	label: "Intensidad"
}, Ll = {
	type: "seed",
	def: 1,
	label: "Variación"
}, Rl = [
	$({
		id: "vhs",
		name: "VHS",
		description: "Cinta de vídeo: color corrido, ondulación, franja de tracking y ruido.",
		category: "retro",
		engine: "shader",
		tags: [
			"vhs",
			"cinta",
			"90s",
			"retro",
			"analógico"
		],
		params: {
			amount: Il,
			noise: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .5,
				label: "Ruido"
			},
			seed: Ll
		},
		frag: "\nuniform float u_amount; uniform float u_noise;\nvec4 effect(vec2 uv) {\n  float t = uTime;\n  float wob = sin(uv.y * 12.0 + t * 3.0) * 0.0025 * u_amount\n    + (hash11(floor(t * 8.0) + uSeed) - 0.5) * 0.002 * u_amount;\n  float band = smoothstep(0.08, 0.0, abs(uv.y - fract(1.0 - t * 0.15 + uSeed * 0.37)));\n  vec2 p = uv + vec2(wob + band * 0.03 * u_amount, 0.0);\n  vec4 c = straight(src(p));\n  float ca = 0.004 * u_amount;\n  vec3 col = vec3(straight(src(p + vec2(ca, 0.0))).r, c.g, straight(src(p - vec2(ca, 0.0))).b);\n  col = mix(col, vec3(luma(col)), 0.25 * u_amount);\n  col = (col - 0.5) * (1.0 + 0.2 * u_amount) + 0.5;\n  float n = hash12(uv * uRes * 0.5 + vec2(uFrame, uSeed));\n  col += (n - 0.5) * 0.12 * u_noise;\n  col += band * n * 0.4 * u_amount;\n  col *= 0.92 + 0.08 * sin(uv.y * contentPx().y * 1.5);\n  return premul(vec4(clamp(col, 0.0, 1.0), c.a));\n}"
	}),
	$({
		id: "film_8mm",
		name: "Película 8 mm",
		description: "Película casera: tono cálido, grano, parpadeo, rayas y polvo.",
		category: "retro",
		engine: "shader",
		tags: [
			"película",
			"super 8",
			"vintage",
			"grano",
			"polvo"
		],
		params: {
			amount: Il,
			grain: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .5,
				label: "Grano"
			},
			scratches: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .6,
				label: "Rayas y polvo"
			},
			seed: Ll
		},
		frag: "\nuniform float u_amount; uniform float u_grain; uniform float u_scratches;\nvec4 effect(vec2 uv) {\n  float f = floor(uFrame / 2.0);\n  vec2 jit = (hash22(vec2(f, uSeed)) - 0.5) * 0.004 * u_amount;\n  vec4 c = straight(src(uv + jit));\n  vec3 col = c.rgb;\n  col = mix(col, vec3(luma(col)) * vec3(1.08, 0.98, 0.82), 0.45 * u_amount);\n  col *= 1.0 + (hash11(f + uSeed) - 0.5) * 0.12 * u_amount;\n  col += (hash12(uv * uRes + vec2(uFrame * 7.0, uSeed)) - 0.5) * 0.18 * u_grain;\n  float sx = hash11(f * 1.3 + uSeed);\n  float scratch = step(0.5, hash11(f * 2.1 + uSeed)) * smoothstep(0.0015, 0.0, abs(uv.x - sx));\n  col = mix(col, vec3(0.85), scratch * u_scratches * 0.7);\n  float dust = step(0.9985, hash12(floor(uv * vec2(90.0, 160.0)) + vec2(f * 3.1, uSeed)));\n  col = mix(col, vec3(0.08), dust * u_scratches);\n  vec2 d = uv - 0.5;\n  col *= 1.0 - dot(d, d) * 0.9 * u_amount;\n  return premul(vec4(clamp(col, 0.0, 1.0), c.a));\n}"
	}),
	$({
		id: "old_film",
		name: "Cine antiguo",
		description: "Blanco y negro de cine mudo con parpadeo, rayas y viñeta.",
		category: "retro",
		engine: "shader",
		tags: [
			"blanco y negro",
			"cine mudo",
			"antiguo",
			"película"
		],
		params: {
			amount: Il,
			seed: Ll
		},
		frag: "\nuniform float u_amount;\nvec4 effect(vec2 uv) {\n  float f = floor(uFrame / 2.0);\n  vec2 jit = vec2(0.0, (hash11(f + uSeed * 5.0) - 0.5) * 0.006 * u_amount);\n  vec4 c = straight(src(uv + jit));\n  float l = luma(c.rgb);\n  l = (l - 0.5) * 1.25 + 0.5;\n  l *= 1.0 + (hash11(f * 0.7 + uSeed) - 0.5) * 0.2 * u_amount;\n  l += (hash12(uv * uRes + vec2(uFrame, uSeed)) - 0.5) * 0.15 * u_amount;\n  float sx = hash11(f * 1.9 + uSeed);\n  l = mix(l, 0.9, step(0.6, hash11(f * 3.3)) * smoothstep(0.002, 0.0, abs(uv.x - sx)) * u_amount);\n  vec2 d = uv - 0.5;\n  l *= 1.0 - dot(d, d) * 1.3 * u_amount;\n  vec3 col = mix(c.rgb, vec3(clamp(l, 0.0, 1.0)), u_amount);\n  return premul(vec4(col, c.a));\n}"
	}),
	$({
		id: "crt",
		name: "Tele de tubo",
		description: "Pantalla CRT: curvatura, líneas, rejilla de color y parpadeo.",
		category: "retro",
		engine: "shader",
		tags: [
			"crt",
			"tele",
			"tubo",
			"monitor",
			"arcade"
		],
		params: {
			amount: Il,
			curve: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .5,
				label: "Curvatura"
			},
			seed: Ll
		},
		frag: "\nuniform float u_amount; uniform float u_curve;\nvec4 effect(vec2 uv) {\n  vec2 q = uv * 2.0 - 1.0;\n  q *= 1.0 + dot(q.yx, q.yx) * 0.08 * u_curve;\n  vec2 p = q * 0.5 + 0.5;\n  vec4 base = src(uv);\n  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0, 0.0, 0.0, base.a);\n  vec4 c = straight(src(p));\n  vec3 col = c.rgb;\n  float sl = 0.5 + 0.5 * sin(p.y * contentPx().y / 3.0 * PI);\n  float m = mod(floor(p.x * contentPx().x), 3.0);\n  vec3 mask = m < 1.0 ? vec3(1.0, 0.7, 0.7) : (m < 2.0 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0));\n  col *= mix(vec3(1.0), mask, 0.35 * u_amount);\n  col *= mix(1.0, 0.7 + 0.3 * sl, u_amount);\n  col *= 1.0 - 0.04 * u_amount * hash11(uFrame + uSeed);\n  vec2 d = p - 0.5;\n  col *= 1.0 - dot(d, d) * 1.2 * u_amount;\n  return premul(vec4(clamp(col * 1.1, 0.0, 1.0), c.a));\n}"
	}),
	$({
		id: "scanlines",
		name: "Líneas de barrido",
		description: "Líneas horizontales de monitor con un parpadeo suave.",
		category: "retro",
		engine: "shader",
		tags: [
			"líneas",
			"scanlines",
			"monitor",
			"crt"
		],
		params: {
			amount: {
				...Il,
				def: .5
			},
			lines: {
				type: "range",
				min: 100,
				max: 800,
				step: 10,
				def: 360,
				label: "Número de líneas"
			},
			flicker: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .4,
				label: "Parpadeo"
			},
			seed: Ll
		},
		frag: "\nuniform float u_amount; uniform float u_lines; uniform float u_flicker;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float line = 0.5 + 0.5 * sin((uv.y * u_lines + uTime * 2.0) * TAU);\n  float fl = 1.0 - u_flicker * 0.15 * hash11(uFrame + uSeed);\n  return vec4(c.rgb * mix(1.0, 0.55 + 0.45 * line, u_amount) * fl, c.a);\n}"
	})
], zl = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: .5,
	label: "Intensidad"
}, Bl = {
	type: "range",
	min: 0,
	max: 4,
	step: .1,
	def: 1,
	label: "Velocidad"
}, Vl = [
	$({
		id: "wave",
		name: "Ondas",
		description: "La imagen ondula como una bandera o el agua.",
		category: "distort",
		engine: "shader",
		tags: [
			"ondas",
			"agua",
			"ondular",
			"bandera"
		],
		params: {
			amount: zl,
			freq: {
				type: "range",
				min: .5,
				max: 12,
				step: .5,
				def: 3,
				label: "Frecuencia"
			},
			speed: Bl,
			dir: {
				type: "select",
				options: [{
					id: "h",
					label: "Horizontal"
				}, {
					id: "v",
					label: "Vertical"
				}],
				def: "h",
				label: "Dirección"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_freq; uniform float u_speed; uniform float u_dir;\nvec4 effect(vec2 uv) {\n  float a = u_amount * 0.03;\n  float ph = uTime * u_speed * TAU;\n  vec2 off = u_dir < 0.5\n    ? vec2(sin(uv.y * u_freq * TAU + ph) * a, 0.0)\n    : vec2(0.0, sin(uv.x * u_freq * TAU + ph) * a);\n  return src(mirrorUv(uv + off));\n}"
	}),
	$({
		id: "bulge",
		name: "Ojo de pez",
		description: "Abomba el centro (o lo hunde) con un pulso opcional.",
		category: "distort",
		engine: "shader",
		tags: [
			"ojo de pez",
			"fisheye",
			"lente",
			"abombar"
		],
		params: {
			amount: {
				type: "range",
				min: -1,
				max: 1,
				step: .01,
				def: .5,
				label: "Fuerza"
			},
			pulse: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: 0,
				label: "Pulso"
			},
			rate: {
				type: "range",
				min: .1,
				max: 4,
				step: .1,
				def: 1,
				label: "Ritmo"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_pulse; uniform float u_rate;\nvec4 effect(vec2 uv) {\n  float s = u_amount * (1.0 - u_pulse + u_pulse * (0.5 + 0.5 * sin(uTime * u_rate * TAU)));\n  vec2 asp = aspect();\n  vec2 d = (uv - 0.5) * asp;\n  float r = length(d);\n  vec2 p = d * (1.0 - s * 0.6 * (1.0 - smoothstep(0.0, 0.9, r)));\n  return src(p / asp + 0.5);\n}"
	}),
	$({
		id: "swirl",
		name: "Remolino",
		description: "Retuerce el centro de la imagen en espiral.",
		category: "distort",
		engine: "shader",
		tags: [
			"remolino",
			"espiral",
			"twirl",
			"hipnótico"
		],
		params: {
			amount: zl,
			radius: {
				type: "range",
				min: .1,
				max: 1.2,
				step: .01,
				def: .6,
				label: "Radio"
			},
			speed: Bl
		},
		frag: "\nuniform float u_amount; uniform float u_radius; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  vec2 asp = aspect();\n  vec2 d = (uv - 0.5) * asp;\n  float r = length(d);\n  float ang = u_amount * 6.0 * (1.0 - smoothstep(0.0, u_radius, r))\n    * (u_speed > 0.0 ? sin(uTime * u_speed * 0.5 * TAU) : 1.0);\n  float s = sin(ang);\n  float c = cos(ang);\n  d = mat2(c, -s, s, c) * d;\n  return src(mirrorUv(d / asp + 0.5));\n}"
	}),
	$({
		id: "ripple",
		name: "Gota de agua",
		description: "Ondas concéntricas que salen del centro.",
		category: "distort",
		engine: "shader",
		tags: [
			"gota",
			"agua",
			"ondas",
			"ripple"
		],
		params: {
			amount: zl,
			freq: {
				type: "range",
				min: 1,
				max: 20,
				step: .5,
				def: 8,
				label: "Frecuencia"
			},
			speed: Bl
		},
		frag: "\nuniform float u_amount; uniform float u_freq; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  vec2 asp = aspect();\n  vec2 d = (uv - 0.5) * asp;\n  float r = length(d);\n  float w = sin(r * u_freq * TAU - uTime * u_speed * TAU) * u_amount * 0.02 * (1.0 - smoothstep(0.3, 1.2, r));\n  vec2 p = (d + normalize(d + 1e-6) * w) / asp + 0.5;\n  return src(mirrorUv(p));\n}"
	}),
	$({
		id: "mirror",
		name: "Espejo",
		description: "Refleja una mitad sobre la otra, o en cuatro.",
		category: "distort",
		engine: "shader",
		tags: [
			"espejo",
			"simetría",
			"reflejo"
		],
		params: {
			mode: {
				type: "select",
				label: "Modo",
				def: "lr",
				options: [
					{
						id: "lr",
						label: "Izquierda ↔ derecha"
					},
					{
						id: "tb",
						label: "Arriba ↔ abajo"
					},
					{
						id: "quad",
						label: "Cuatro"
					}
				]
			},
			drift: {
				type: "range",
				min: -1,
				max: 1,
				step: .01,
				def: 0,
				label: "Desplazamiento"
			}
		},
		frag: "\nuniform float u_mode; uniform float u_drift;\nvec4 effect(vec2 uv) {\n  vec2 p = uv;\n  float o = u_drift * 0.2 * uTime;\n  if (u_mode < 0.5) p.x = p.x < 0.5 ? p.x : 1.0 - p.x;\n  else if (u_mode < 1.5) p.y = p.y < 0.5 ? p.y : 1.0 - p.y;\n  else p = 0.5 - abs(p - 0.5);\n  return src(mirrorUv(p + vec2(o, 0.0)));\n}"
	}),
	$({
		id: "kaleidoscope",
		name: "Caleidoscopio",
		description: "Gajos reflejados que giran alrededor del centro.",
		category: "distort",
		engine: "shader",
		tags: [
			"caleidoscopio",
			"psicodélico",
			"simetría"
		],
		params: {
			segments: {
				type: "range",
				min: 2,
				max: 16,
				step: 1,
				def: 6,
				label: "Gajos"
			},
			speed: {
				...Bl,
				def: .3
			},
			zoom: {
				type: "range",
				min: .3,
				max: 2,
				step: .01,
				def: 1,
				label: "Zoom"
			}
		},
		frag: "\nuniform float u_segments; uniform float u_speed; uniform float u_zoom;\nvec4 effect(vec2 uv) {\n  vec2 asp = aspect();\n  vec2 d = (uv - 0.5) * asp;\n  float r = length(d) / u_zoom;\n  float a = atan(d.y, d.x) + uTime * u_speed;\n  float seg = TAU / max(2.0, floor(u_segments));\n  a = mod(a, seg);\n  a = abs(a - seg * 0.5);\n  vec2 p = vec2(cos(a), sin(a)) * r;\n  return src(mirrorUv(p / asp + 0.5));\n}"
	}),
	$({
		id: "split_screen",
		name: "Pantalla dividida",
		description: "La imagen repetida en 2, 3, 4 o 9 recuadros.",
		category: "distort",
		engine: "shader",
		tags: [
			"dividir",
			"split",
			"repetir",
			"cuadrícula",
			"multipantalla"
		],
		params: { count: {
			type: "select",
			label: "Copias",
			def: "3",
			options: [
				{
					id: "2",
					label: "2"
				},
				{
					id: "3",
					label: "3"
				},
				{
					id: "4",
					label: "4"
				},
				{
					id: "9",
					label: "9"
				}
			]
		} },
		frag: "\nuniform float u_count;\nvec4 effect(vec2 uv) {\n  vec2 n = u_count < 0.5 ? vec2(1.0, 2.0) : (u_count < 1.5 ? vec2(1.0, 3.0) : (u_count < 2.5 ? vec2(2.0, 2.0) : vec2(3.0, 3.0)));\n  vec2 cu = fract(uv * n);\n  vec2 px = contentPx();\n  float cellAsp = (px.x / n.x) / (px.y / n.y);\n  float srcAsp = px.x / px.y;\n  vec2 frac = cellAsp > srcAsp ? vec2(1.0, srcAsp / cellAsp) : vec2(cellAsp / srcAsp, 1.0);\n  return src(0.5 + (cu - 0.5) * frac);\n}"
	})
], Hl = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: .7,
	label: "Intensidad"
}, Ul = {
	type: "range",
	min: .2,
	max: 8,
	step: .1,
	def: 2,
	label: "Ritmo (por segundo)"
}, Wl = [
	$({
		id: "flash",
		name: "Destello",
		description: "Destellos de luz que decaen, uno por golpe de ritmo.",
		category: "light",
		engine: "shader",
		tags: [
			"flash",
			"destello",
			"blanco",
			"golpe",
			"beat"
		],
		defaultDur: 1,
		thumb: { t: .06 },
		params: {
			amount: {
				...Hl,
				def: .9
			},
			rate: {
				...Ul,
				def: 1
			},
			color: {
				type: "color",
				def: "#ffffff",
				label: "Color"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_rate; uniform vec3 u_color;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float k = exp(-fract(uTime * u_rate) * 8.0) * u_amount;\n  return vec4(mix(c.rgb, u_color * c.a, k), c.a);\n}"
	}),
	$({
		id: "strobe",
		name: "Estroboscopio",
		description: "Parpadeo rápido a negro, a blanco o invirtiendo colores.",
		category: "light",
		engine: "shader",
		tags: [
			"estrobo",
			"parpadeo",
			"fiesta",
			"flash"
		],
		thumb: {
			t: .1,
			params: { mode: "invert" }
		},
		params: {
			amount: {
				...Hl,
				def: 1
			},
			rate: {
				...Ul,
				def: 6
			},
			mode: {
				type: "select",
				label: "Modo",
				def: "black",
				options: [
					{
						id: "black",
						label: "Negro"
					},
					{
						id: "white",
						label: "Blanco"
					},
					{
						id: "invert",
						label: "Invertir"
					}
				]
			}
		},
		frag: "\nuniform float u_amount; uniform float u_rate; uniform float u_mode;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float on = step(0.5, fract(uTime * u_rate));\n  vec3 alt = u_mode < 0.5 ? vec3(0.0) : (u_mode < 1.5 ? vec3(c.a) : vec3(c.a) - c.rgb);\n  return vec4(mix(c.rgb, alt, on * u_amount), c.a);\n}"
	}),
	$({
		id: "light_leak",
		name: "Fuga de luz",
		description: "Manchas de luz cálida que cruzan la imagen, como en película.",
		category: "light",
		engine: "shader",
		tags: [
			"fuga de luz",
			"light leak",
			"cálido",
			"película",
			"sueño"
		],
		params: {
			amount: Hl,
			speed: {
				type: "range",
				min: 0,
				max: 3,
				step: .1,
				def: 1,
				label: "Velocidad"
			},
			color: {
				type: "color",
				def: "#ff8a3d",
				label: "Color"
			},
			seed: {
				type: "seed",
				def: 1,
				label: "Variación"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_speed; uniform vec3 u_color;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float t = uTime * u_speed * 0.25 + uSeed * 1.7;\n  float f = fbm(uv * vec2(1.8, 1.2) + vec2(t, -t * 0.7));\n  float g = smoothstep(0.35, 0.95, f + 0.35 * sin(uv.x * 2.0 + t * 2.0));\n  vec3 leak = u_color * g * 1.2 * u_amount * c.a;\n  return vec4(min(c.rgb + leak - c.rgb * leak, vec3(c.a)), c.a);\n}"
	}),
	$({
		id: "glow_pulse",
		name: "Brillo que late",
		description: "Las zonas claras irradian un resplandor que late.",
		category: "light",
		engine: "shader",
		tags: [
			"brillo",
			"glow",
			"bloom",
			"resplandor"
		],
		params: {
			amount: Hl,
			rate: {
				...Ul,
				def: 1
			},
			radius: {
				type: "range",
				min: .1,
				max: 2,
				step: .05,
				def: .8,
				label: "Radio"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_rate; uniform float u_radius;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  vec2 px = u_radius * 0.03 * minSide() * onePx();\n  vec4 acc = vec4(0.0);\n  for (int i = 0; i < 12; i++) {\n    float a = float(i) * TAU / 12.0;\n    for (int j = 1; j <= 3; j++) {\n      vec4 s = src(uv + vec2(cos(a), sin(a)) * px * float(j) / 3.0);\n      acc += s * smoothstep(0.55, 1.0, luma(straight(s).rgb));\n    }\n  }\n  acc /= 36.0;\n  float pulse = 0.5 + 0.5 * sin(uTime * u_rate * TAU);\n  float a = max(c.a, acc.a * u_amount);\n  vec3 col = c.rgb + acc.rgb * u_amount * (0.6 + 0.8 * pulse) * 2.0;\n  return vec4(min(col, vec3(a)), a);\n}"
	}),
	$({
		id: "rainbow",
		name: "Arcoíris",
		description: "Los colores giran por todo el arcoíris.",
		category: "light",
		engine: "shader",
		tags: [
			"arcoíris",
			"color",
			"psicodélico",
			"hue"
		],
		params: {
			amount: Hl,
			speed: {
				type: "range",
				min: 0,
				max: 4,
				step: .1,
				def: 1,
				label: "Velocidad"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  vec4 c = straight(src(uv));\n  vec3 h = rgb2hsv(c.rgb);\n  h.x = fract(h.x + uTime * u_speed * 0.25 + uv.y * 0.3 * u_amount);\n  h.y = max(h.y, 0.5 * u_amount);\n  return premul(vec4(mix(c.rgb, hsv2rgb(h), u_amount), c.a));\n}"
	})
], Gl = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: .5,
	label: "Intensidad"
}, Kl = {
	type: "range",
	min: 0,
	max: 4,
	step: .1,
	def: 1,
	label: "Ritmo"
}, ql = [
	$({
		id: "zoom_blur",
		name: "Zoom borroso",
		description: "Desenfoque radial desde el centro, como un golpe de zoom.",
		category: "lens",
		engine: "shader",
		tags: [
			"zoom",
			"desenfoque",
			"radial",
			"velocidad",
			"impacto"
		],
		params: {
			amount: Gl,
			pulse: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: 0,
				label: "Pulso"
			},
			rate: {
				...Kl,
				def: 1.5
			}
		},
		frag: "\nuniform float u_amount; uniform float u_pulse; uniform float u_rate;\nvec4 effect(vec2 uv) {\n  float s = u_amount * 0.15 * (1.0 - u_pulse + u_pulse * (0.5 + 0.5 * sin(uTime * u_rate * TAU)));\n  vec2 d = uv - 0.5;\n  vec4 acc = vec4(0.0);\n  for (int i = 0; i < 24; i++) acc += src(0.5 + d * (1.0 - s * float(i) / 23.0));\n  return acc / 24.0;\n}"
	}),
	$({
		id: "chromatic",
		name: "Aberración cromática",
		description: "Bordes de color separados que laten desde el centro.",
		category: "lens",
		engine: "shader",
		tags: [
			"aberración",
			"cromática",
			"rgb",
			"lente"
		],
		params: {
			amount: Gl,
			rate: Kl
		},
		frag: "\nuniform float u_amount; uniform float u_rate;\nvec4 effect(vec2 uv) {\n  float k = u_amount * 0.02 * (u_rate > 0.0 ? 0.6 + 0.4 * sin(uTime * u_rate * TAU) : 1.0);\n  vec2 d = uv - 0.5;\n  vec4 r = src(uv + d * k);\n  vec4 g = src(uv);\n  vec4 b = src(uv - d * k);\n  return vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));\n}"
	}),
	$({
		id: "vignette_pulse",
		name: "Viñeta que late",
		description: "Bordes oscurecidos que se abren y se cierran.",
		category: "lens",
		engine: "shader",
		tags: [
			"viñeta",
			"bordes",
			"latido",
			"tensión"
		],
		params: {
			amount: {
				...Gl,
				def: .8
			},
			rate: Kl,
			color: {
				type: "color",
				def: "#000000",
				label: "Color"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_rate; uniform vec3 u_color;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float r = length((uv - 0.5) * aspect());\n  float p = 0.5 + 0.5 * sin(uTime * u_rate * TAU);\n  float v = smoothstep(0.35 + 0.12 * (1.0 - p), 0.95, r) * u_amount;\n  return vec4(mix(c.rgb, u_color * c.a, v), c.a);\n}"
	}),
	$({
		id: "defocus",
		name: "Desenfoque que respira",
		description: "La imagen entra y sale de foco suavemente.",
		category: "lens",
		engine: "shader",
		tags: [
			"desenfoque",
			"foco",
			"blur",
			"sueño"
		],
		params: {
			amount: Gl,
			rate: {
				...Kl,
				def: .5
			}
		},
		frag: "\nuniform float u_amount; uniform float u_rate;\nvec4 effect(vec2 uv) {\n  float p = u_rate > 0.0 ? 0.5 - 0.5 * cos(uTime * u_rate * TAU) : 1.0;\n  vec2 px = u_amount * 0.02 * p * minSide() * onePx();\n  vec4 acc = src(uv);\n  for (int i = 0; i < 24; i++) {\n    float a = float(i) * 2.39996;\n    float rr = sqrt(float(i) + 0.5) / sqrt(24.0);\n    acc += src(uv + vec2(cos(a), sin(a)) * rr * px);\n  }\n  return acc / 25.0;\n}"
	})
], Jl = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: .5,
	label: "Intensidad"
}, Yl = {
	type: "seed",
	def: 1,
	label: "Variación"
}, Xl = [
	$({
		id: "shake",
		name: "Temblor",
		description: "Cámara en mano nerviosa: sacudidas suaves con un poco de giro.",
		category: "motion",
		engine: "shader",
		tags: [
			"temblor",
			"sacudida",
			"cámara",
			"shake",
			"terremoto"
		],
		params: {
			amount: Jl,
			speed: {
				type: "range",
				min: .2,
				max: 4,
				step: .1,
				def: 1,
				label: "Velocidad"
			},
			seed: Yl
		},
		frag: "\nuniform float u_amount; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  float t = uTime * u_speed * 12.0;\n  float i = floor(t);\n  float f = smoothstep(0.0, 1.0, fract(t));\n  vec2 off = mix(hash22(vec2(i, uSeed)), hash22(vec2(i + 1.0, uSeed)), f) - 0.5;\n  off *= 0.06 * u_amount;\n  float rot = (mix(hash11(i + uSeed * 3.0), hash11(i + 1.0 + uSeed * 3.0), f) - 0.5) * 0.08 * u_amount;\n  float zoom = 1.0 + 0.08 * u_amount;\n  vec2 asp = aspect();\n  vec2 d = (uv - 0.5) * asp;\n  float s = sin(rot);\n  float c = cos(rot);\n  d = mat2(c, -s, s, c) * d;\n  return src(mirrorUv(d / asp / zoom + 0.5 + off));\n}"
	}),
	$({
		id: "heartbeat",
		name: "Latido",
		description: "Golpes de zoom al ritmo de un corazón (o de la música).",
		category: "motion",
		engine: "shader",
		tags: [
			"latido",
			"zoom",
			"pulso",
			"beat",
			"corazón"
		],
		params: {
			amount: Jl,
			bpm: {
				type: "range",
				min: 40,
				max: 180,
				step: 1,
				def: 90,
				label: "Pulsaciones (BPM)"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_bpm;\nvec4 effect(vec2 uv) {\n  float ph = fract(uTime * u_bpm / 60.0);\n  float beat = exp(-ph * 8.0) + 0.6 * exp(-max(0.0, ph - 0.18) * 10.0) * step(0.18, ph);\n  float z = 1.0 + u_amount * 0.12 * beat;\n  return src((uv - 0.5) / z + 0.5);\n}"
	}),
	$({
		id: "earthquake",
		name: "Terremoto",
		description: "Sacudida fuerte con estela, para impactos y explosiones.",
		category: "motion",
		engine: "shader",
		tags: [
			"terremoto",
			"impacto",
			"explosión",
			"sacudida"
		],
		defaultDur: 1.2,
		params: {
			amount: {
				...Jl,
				def: .8
			},
			decay: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .6,
				label: "Se calma"
			},
			seed: Yl
		},
		frag: "\nuniform float u_amount; uniform float u_decay;\nvec4 effect(vec2 uv) {\n  float k = u_amount * mix(1.0, 1.0 - uProgress, u_decay);\n  float t = uFrame;\n  vec2 off = (hash22(vec2(t, uSeed)) - 0.5) * 0.08 * k;\n  vec2 prev = (hash22(vec2(t - 1.0, uSeed)) - 0.5) * 0.08 * k;\n  float zoom = 1.0 + 0.1 * k;\n  vec4 acc = vec4(0.0);\n  for (int i = 0; i < 6; i++) {\n    vec2 o = mix(prev, off, float(i) / 5.0);\n    acc += src(mirrorUv((uv - 0.5) / zoom + 0.5 + o));\n  }\n  return acc / 6.0;\n}"
	}),
	$({
		id: "drift",
		name: "Flotar",
		description: "El encuadre deriva despacio, como una cámara flotando.",
		category: "motion",
		engine: "shader",
		tags: [
			"flotar",
			"deriva",
			"suave",
			"handheld"
		],
		params: {
			amount: {
				...Jl,
				def: .4
			},
			speed: {
				type: "range",
				min: .05,
				max: 2,
				step: .05,
				def: .3,
				label: "Velocidad"
			},
			seed: Yl
		},
		frag: "\nuniform float u_amount; uniform float u_speed;\nvec4 effect(vec2 uv) {\n  float t = uTime * u_speed;\n  vec2 off = vec2(noise(vec2(t, uSeed)) - 0.5, noise(vec2(uSeed, t + 7.0)) - 0.5) * 0.08 * u_amount;\n  float zoom = 1.0 + 0.1 * u_amount;\n  return src(mirrorUv((uv - 0.5) / zoom + 0.5 + off));\n}"
	})
], Zl = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: 1,
	label: "Intensidad"
}, Ql = "\nfloat edgeAt(vec2 uv, float s) {\n  vec2 o = onePx() * s;\n  float tl = luma(straight(src(uv + o * vec2(-1.0, -1.0))).rgb);\n  float t  = luma(straight(src(uv + o * vec2( 0.0, -1.0))).rgb);\n  float tr = luma(straight(src(uv + o * vec2( 1.0, -1.0))).rgb);\n  float l  = luma(straight(src(uv + o * vec2(-1.0,  0.0))).rgb);\n  float r  = luma(straight(src(uv + o * vec2( 1.0,  0.0))).rgb);\n  float bl = luma(straight(src(uv + o * vec2(-1.0,  1.0))).rgb);\n  float b  = luma(straight(src(uv + o * vec2( 0.0,  1.0))).rgb);\n  float br = luma(straight(src(uv + o * vec2( 1.0,  1.0))).rgb);\n  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;\n  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;\n  return length(vec2(gx, gy));\n}", $l = [
	$({
		id: "halftone",
		name: "Cómic (semitono)",
		description: "Puntos de imprenta de cómic, con giro opcional de la trama.",
		category: "style",
		engine: "shader",
		tags: [
			"cómic",
			"semitono",
			"puntos",
			"pop art",
			"halftone"
		],
		params: {
			amount: Zl,
			size: {
				type: "range",
				min: .005,
				max: .05,
				step: .001,
				def: .014,
				label: "Tamaño del punto"
			},
			spin: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: 0,
				label: "Giro de la trama"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_size; uniform float u_spin;\nvec4 effect(vec2 uv) {\n  vec2 px = uv * contentPx();\n  float cell = max(3.0, u_size * minSide());\n  float a = 0.785 + uTime * u_spin;\n  mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));\n  vec2 q = R * px;\n  vec2 cid = floor(q / cell) + 0.5;\n  vec2 center = transpose(R) * (cid * cell);\n  vec4 s = straight(src(center / contentPx()));\n  float rad = (1.0 - luma(s.rgb)) * cell * 0.62;\n  float d = length(q - cid * cell);\n  float dotv = 1.0 - smoothstep(rad - 1.0, rad + 1.0, d);\n  vec3 col = mix(vec3(1.0, 0.98, 0.94), s.rgb * 0.35, dotv);\n  vec4 o = straight(src(uv));\n  return premul(vec4(mix(o.rgb, col, u_amount), o.a));\n}"
	}),
	$({
		id: "neon_edges",
		name: "Contornos de neón",
		description: "Oscurece la imagen y hace brillar sus contornos como tubos de neón.",
		category: "style",
		engine: "shader",
		tags: [
			"neón",
			"contornos",
			"bordes",
			"brillo",
			"cyberpunk"
		],
		params: {
			amount: Zl,
			color: {
				type: "color",
				def: "#22d3ee",
				label: "Color"
			},
			pulse: {
				type: "range",
				min: 0,
				max: 4,
				step: .1,
				def: 1,
				label: "Ritmo"
			}
		},
		frag: Ql + "\nuniform float u_amount; uniform vec3 u_color; uniform float u_pulse;\nvec4 effect(vec2 uv) {\n  float s = max(1.0, minSide() / 540.0);\n  float glow = smoothstep(0.1, 0.5, edgeAt(uv, s)) + 0.5 * smoothstep(0.1, 0.5, edgeAt(uv, s * 3.0));\n  float p = 0.75 + 0.25 * sin(uTime * u_pulse * TAU);\n  vec4 c = src(uv);\n  vec3 col = c.rgb * (1.0 - 0.8 * u_amount) + u_color * glow * p * u_amount * c.a;\n  return vec4(min(col, vec3(c.a)), c.a);\n}"
	}),
	$({
		id: "cartoon",
		name: "Dibujo animado",
		description: "Colores planos con contorno negro que tiembla un poco.",
		category: "style",
		engine: "shader",
		tags: [
			"cartoon",
			"dibujo",
			"posterizar",
			"cel shading"
		],
		params: {
			amount: Zl,
			levels: {
				type: "range",
				min: 2,
				max: 12,
				step: 1,
				def: 5,
				label: "Colores"
			},
			boil: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .4,
				label: "Temblor del trazo"
			}
		},
		frag: Ql + "\nuniform float u_amount; uniform float u_levels; uniform float u_boil;\nvec4 effect(vec2 uv) {\n  vec2 j = (vec2(noise(uv * 40.0 + floor(uFrame / 4.0)), noise(uv * 40.0 + 9.0 + floor(uFrame / 4.0))) - 0.5) * 0.003 * u_boil;\n  vec4 c = straight(src(uv + j));\n  vec3 q = floor(c.rgb * u_levels + 0.5) / u_levels;\n  float e = smoothstep(0.25, 0.6, edgeAt(uv + j, max(1.0, minSide() / 720.0)));\n  q *= 1.0 - e;\n  return premul(vec4(mix(c.rgb, q, u_amount), c.a));\n}"
	}),
	$({
		id: "pixel_pulse",
		name: "Píxeles",
		description: "La imagen se pixela y vuelve, a golpes o fija.",
		category: "style",
		engine: "shader",
		tags: [
			"pixelar",
			"píxeles",
			"8 bits",
			"mosaico"
		],
		params: {
			amount: {
				...Zl,
				def: .5
			},
			rate: {
				type: "range",
				min: 0,
				max: 4,
				step: .1,
				def: 1,
				label: "Ritmo (0 = fijo)"
			}
		},
		frag: "\nuniform float u_amount; uniform float u_rate;\nvec4 effect(vec2 uv) {\n  float p = u_rate > 0.0 ? 0.5 - 0.5 * cos(uTime * u_rate * TAU) : 1.0;\n  float block = 1.0 + u_amount * 0.08 * minSide() * p;\n  vec2 bs = vec2(block) * onePx();\n  return src((floor(uv / bs) + 0.5) * bs);\n}"
	}),
	$({
		id: "sketch",
		name: "Boceto a lápiz",
		description: "Trazos de lápiz sobre papel, con sombreado a rayas.",
		category: "style",
		engine: "shader",
		tags: [
			"boceto",
			"lápiz",
			"dibujo",
			"sketch"
		],
		params: {
			amount: Zl,
			boil: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .5,
				label: "Temblor del trazo"
			}
		},
		frag: Ql + "\nuniform float u_amount; uniform float u_boil;\nvec4 effect(vec2 uv) {\n  float f = floor(uFrame / 4.0);\n  vec2 j = (hash22(floor(uv * 60.0) + f) - 0.5) * 0.002 * u_boil;\n  vec4 c = straight(src(uv + j));\n  float l = luma(c.rgb);\n  float e = edgeAt(uv + j, max(1.0, minSide() / 720.0));\n  float pencil = 1.0 - smoothstep(0.08, 0.45, e);\n  vec2 px = uv * contentPx();\n  float hatch = step(0.5, fract((px.x + px.y) / max(4.0, minSide() / 180.0)));\n  float shade = mix(1.0, 0.78 + 0.22 * hatch, step(l, 0.45));\n  vec3 col = vec3(0.97, 0.96, 0.93) * pencil * shade;\n  return premul(vec4(mix(c.rgb, col, u_amount), c.a));\n}"
	}),
	$({
		id: "sticker",
		name: "Pegatina",
		description: "Borde grueso alrededor del sujeto recortado, como una pegatina.",
		category: "style",
		engine: "shader",
		pad: .06,
		tags: [
			"pegatina",
			"sticker",
			"borde",
			"contorno",
			"recorte"
		],
		params: {
			width: {
				type: "range",
				min: .005,
				max: .06,
				step: .001,
				def: .025,
				label: "Grosor"
			},
			color: {
				type: "color",
				def: "#ffffff",
				label: "Color"
			},
			wobble: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: 0,
				label: "Temblor"
			}
		},
		frag: "\nuniform float u_width; uniform vec3 u_color; uniform float u_wobble;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float w = noise(uv * 8.0 + floor(uFrame / 4.0) * 3.1);\n  float rad = u_width * minSide() * (1.0 + 0.4 * u_wobble * (w - 0.5));\n  float a = 0.0;\n  for (int i = 0; i < 24; i++) {\n    float ang = float(i) * TAU / 24.0;\n    vec2 dir = vec2(cos(ang), sin(ang)) * onePx();\n    a = max(a, src(uv + dir * rad).a);\n    a = max(a, src(uv + dir * rad * 0.5).a);\n  }\n  return c + vec4(u_color, 1.0) * a * (1.0 - c.a);\n}"
	}),
	$({
		id: "float_shadow",
		name: "Sombra flotante",
		description: "Sombra suave debajo del sujeto que sube y baja, como si flotara.",
		category: "style",
		engine: "shader",
		pad: .12,
		tags: [
			"sombra",
			"flotar",
			"profundidad",
			"recorte"
		],
		params: {
			distance: {
				type: "range",
				min: 0,
				max: .1,
				step: .002,
				def: .03,
				label: "Distancia"
			},
			blur: {
				type: "range",
				min: 0,
				max: .06,
				step: .002,
				def: .02,
				label: "Difuminado"
			},
			opacity: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .5,
				label: "Opacidad"
			},
			color: {
				type: "color",
				def: "#000000",
				label: "Color"
			},
			float: {
				type: "range",
				min: 0,
				max: 1,
				step: .01,
				def: .5,
				label: "Flotación"
			}
		},
		frag: "\nuniform float u_distance; uniform float u_blur; uniform float u_opacity; uniform vec3 u_color; uniform float u_float;\nvec4 effect(vec2 uv) {\n  vec4 c = src(uv);\n  float k = 1.0 + u_float * 0.35 * sin(uTime * TAU * 0.8);\n  vec2 off = vec2(0.35, 1.0) * u_distance * k * minSide() * onePx();\n  vec2 br = u_blur * k * minSide() * onePx();\n  float a = src(uv - off).a;\n  for (int i = 0; i < 16; i++) {\n    float ang = float(i) * 2.39996;\n    float rr = sqrt(float(i) + 0.5) / 4.0;\n    a += src(uv - off + vec2(cos(ang), sin(ang)) * rr * br).a;\n  }\n  a = a / 17.0 * u_opacity;\n  return c + vec4(u_color, 1.0) * a * (1.0 - c.a);\n}"
	})
], eu = {
	type: "range",
	min: 0,
	max: 1,
	step: .01,
	def: 1,
	label: "Intensidad"
}, tu = [
	$({
		id: "thermal",
		name: "Cámara térmica",
		description: "Colores de mapa de calor, del azul frío al amarillo.",
		category: "color",
		engine: "shader",
		tags: [
			"térmica",
			"calor",
			"infrarrojo",
			"depredador"
		],
		params: { amount: eu },
		frag: "\nuniform float u_amount;\nvec3 heat(float x) {\n  x = clamp(x, 0.0, 1.0);\n  vec3 a = mix(vec3(0.0, 0.0, 0.25), vec3(0.45, 0.0, 0.7), smoothstep(0.0, 0.3, x));\n  a = mix(a, vec3(0.95, 0.15, 0.1), smoothstep(0.3, 0.6, x));\n  a = mix(a, vec3(1.0, 0.85, 0.1), smoothstep(0.6, 0.85, x));\n  return mix(a, vec3(1.0), smoothstep(0.88, 1.0, x));\n}\nvec4 effect(vec2 uv) {\n  vec4 c = straight(src(uv));\n  float l = luma(c.rgb) + (noise(uv * 30.0 + uTime) - 0.5) * 0.05;\n  return premul(vec4(mix(c.rgb, heat(l), u_amount), c.a));\n}"
	}),
	$({
		id: "night_vision",
		name: "Visión nocturna",
		description: "Verde fósforo con ruido, líneas y viñeta de visor.",
		category: "color",
		engine: "shader",
		tags: [
			"visión nocturna",
			"verde",
			"militar",
			"visor"
		],
		params: {
			amount: eu,
			seed: {
				type: "seed",
				def: 1,
				label: "Variación"
			}
		},
		frag: "\nuniform float u_amount;\nvec4 effect(vec2 uv) {\n  vec4 c = straight(src(uv));\n  float l = pow(luma(c.rgb), 0.8) * 1.4;\n  vec3 g = vec3(0.1, 1.0, 0.25) * l;\n  g += (hash12(uv * uRes + vec2(uFrame, uSeed)) - 0.5) * 0.25;\n  g *= 0.9 + 0.1 * sin(uv.y * contentPx().y * 1.2);\n  g *= 1.0 - smoothstep(0.4, 0.95, length((uv - 0.5) * aspect()));\n  return premul(vec4(mix(c.rgb, clamp(g, 0.0, 1.0), u_amount), c.a));\n}"
	}),
	$({
		id: "duotone",
		name: "Duotono",
		description: "Dos colores (sombras y luces) que pueden alternarse con el ritmo.",
		category: "color",
		engine: "shader",
		tags: [
			"duotono",
			"dos colores",
			"póster",
			"spotify"
		],
		params: {
			amount: eu,
			dark: {
				type: "color",
				def: "#2b1055",
				label: "Sombras"
			},
			light: {
				type: "color",
				def: "#ff5e7e",
				label: "Luces"
			},
			swap: {
				type: "range",
				min: 0,
				max: 4,
				step: .1,
				def: 0,
				label: "Alternar (por segundo)"
			}
		},
		frag: "\nuniform float u_amount; uniform vec3 u_dark; uniform vec3 u_light; uniform float u_swap;\nvec4 effect(vec2 uv) {\n  vec4 c = straight(src(uv));\n  float l = smoothstep(0.05, 0.95, luma(c.rgb));\n  float s = u_swap > 0.0 ? step(0.5, fract(uTime * u_swap)) : 0.0;\n  vec3 a = mix(u_dark, u_light, s);\n  vec3 b = mix(u_light, u_dark, s);\n  return premul(vec4(mix(c.rgb, mix(a, b, l), u_amount), c.a));\n}"
	}),
	$({
		id: "color_pop",
		name: "Color selectivo",
		description: "Todo en blanco y negro salvo un color, que puede ir cambiando.",
		category: "color",
		engine: "shader",
		tags: [
			"color selectivo",
			"blanco y negro",
			"resaltar",
			"sin city"
		],
		params: {
			hue: {
				type: "range",
				min: 0,
				max: 360,
				step: 1,
				def: 0,
				label: "Tono conservado"
			},
			range: {
				type: "range",
				min: .02,
				max: .3,
				step: .01,
				def: .08,
				label: "Margen"
			},
			cycle: {
				type: "range",
				min: 0,
				max: 2,
				step: .05,
				def: 0,
				label: "Recorrer tonos"
			}
		},
		frag: "\nuniform float u_hue; uniform float u_range; uniform float u_cycle;\nvec4 effect(vec2 uv) {\n  vec4 c = straight(src(uv));\n  vec3 h = rgb2hsv(c.rgb);\n  float target = fract(u_hue / 360.0 + uTime * u_cycle * 0.25);\n  float d = abs(h.x - target);\n  d = min(d, 1.0 - d);\n  float keep = (1.0 - smoothstep(u_range, u_range * 1.6, d)) * smoothstep(0.15, 0.3, h.y);\n  return premul(vec4(mix(vec3(luma(c.rgb)), c.rgb, keep), c.a));\n}"
	})
];
//#endregion
//#region src/fx/core/rand.js
function nu(...e) {
	let t = 2166136261;
	for (let n of e) {
		let e = Math.floor(Number(n) * 1000003) | 0;
		e = Math.imul(e, 3432918353), e = e << 15 | e >>> 17, e = Math.imul(e, 461845907), t ^= e, t = t << 13 | t >>> 19, t = Math.imul(t, 5) + 3864292196 | 0;
	}
	return t ^= t >>> 16, t = Math.imul(t, 2246822507), t ^= t >>> 13, t = Math.imul(t, 3266489909), t ^= t >>> 16, t >>> 0;
}
function ru(...e) {
	return nu(...e) / 4294967296;
}
function iu(e, t = 0) {
	let n = 0;
	return () => ru(e, t, n++);
}
//#endregion
//#region src/fx/effects/paper.js
var au = "paper-animator/assets/texture", ou = [
	...[
		0,
		1,
		2,
		3
	].map((e) => `${au}/paper_overlay_${e}.webp`),
	...[
		0,
		1,
		2,
		3,
		4,
		5
	].map((e) => `${au}/paper_mask_${e}.webp`),
	...[
		0,
		1,
		2,
		3,
		4,
		5
	].map((e) => `${au}/paper_fold_${e}.webp`)
], su = [
	20,
	30,
	40,
	10
], cu = 6, lu = 1, uu = 1080, du = "vy-paper-torn", fu = null;
function pu() {
	if (fu && fu.root.isConnected) return fu;
	if (typeof document > "u") return null;
	let e = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	return e.setAttribute("width", "0"), e.setAttribute("height", "0"), e.setAttribute("aria-hidden", "true"), e.style.position = "absolute", e.innerHTML = `
    <filter id="${du}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
      <feMorphology id="${du}-dilate" in="SourceGraphic" operator="dilate" radius="10" result="dilated"/>
      <feTurbulence id="${du}-turb" type="fractalNoise" baseFrequency="0.02" numOctaves="3" result="noise"/>
      <feDisplacementMap id="${du}-disp" in="dilated" in2="noise" scale="15" xChannelSelector="R" yChannelSelector="G" result="torn"/>
      <feFlood flood-color="#FFFFFF" result="white"/>
      <feComposite in="white" in2="torn" operator="in" result="coloredTorn"/>
      <feMerge><feMergeNode in="coloredTorn"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`, document.body.appendChild(e), fu = {
		root: e,
		dilate: e.querySelector(`#${du}-dilate`),
		turb: e.querySelector(`#${du}-turb`),
		disp: e.querySelector(`#${du}-disp`)
	}, fu;
}
var mu = {};
function hu(e, t, n) {
	let r = mu[e];
	r || (r = document.createElement("canvas"), mu[e] = r), (r.width !== t || r.height !== n) && (r.width = t, r.height = n);
	let i = r.getContext("2d");
	return i.setTransform(1, 0, 0, 1, 0, 0), i.globalCompositeOperation = "source-over", i.globalAlpha = 1, i.filter = "none", i.clearRect(0, 0, t, n), {
		c: r,
		g: i
	};
}
var gu = /* @__PURE__ */ new Map();
function _u(e, t, n) {
	let r = (100 - n) / 100, i = `${t}:${r.toFixed(3)}`, a = gu.get(i);
	if (a && a.img === e) return a.canvas;
	let o = document.createElement("canvas");
	o.width = e.naturalWidth, o.height = e.naturalHeight;
	let s = o.getContext("2d", { willReadFrequently: !0 });
	s.drawImage(e, 0, 0);
	let c = s.getImageData(0, 0, o.width, o.height), l = c.data;
	for (let e = 0; e < l.length; e += 4) l[e] += (255 - l[e]) * r, l[e + 1] += (255 - l[e + 1]) * r, l[e + 2] += (255 - l[e + 2]) * r;
	return s.putImageData(c, 0, 0), gu.size > 12 && gu.delete(gu.keys().next().value), gu.set(i, {
		img: e,
		canvas: o
	}), o;
}
function vu(e, t, n, r) {
	let i = 4 * t, a = .5 * n, o = 0;
	i > 0 && a > 0 && (o = Math.floor(e / (1e3 / i)) % 2 == 0 ? a : -a);
	let s = 2 * t, c = 4 * t, l = s > 0 ? (ru(r, 1, Math.floor(e / (1e3 / s))) - .5) * 1 * n : 0, u = c > 0 ? (ru(r, 2, Math.floor(e / (1e3 / c))) - .5) * 5 * n : 0;
	return {
		rotation: o,
		offsetX: l,
		offsetY: u
	};
}
function yu(e, t, n) {
	let r = Math.min(lu, n / 2), i = r / cu;
	return (e === "open" || e === "both") && t < r ? Math.min(5, Math.floor(t / i)) : (e === "close" || e === "both") && t > n - r ? 5 - Math.min(5, Math.floor((t - (n - r)) / i)) : -1;
}
var bu = [
	{
		id: "multiply",
		label: "Multiplicar"
	},
	{
		id: "overlay",
		label: "Superponer"
	},
	{
		id: "soft-light",
		label: "Luz suave"
	},
	{
		id: "hard-light",
		label: "Luz fuerte"
	},
	{
		id: "screen",
		label: "Trama"
	},
	{
		id: "normal",
		label: "Normal"
	}
];
function xu(e, t) {
	let n = parseInt(String(e).replace("#", ""), 16) || 0;
	return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${t})`;
}
var Su = [$({
	id: "paper_cutout",
	name: "Papel recortado",
	description: "Recorte de papel con borde rasgado, arrugas, sombra y vibración stop-motion; puede abrirse y cerrarse plegándose.",
	category: "style",
	engine: "canvas",
	pad: .2,
	tags: [
		"papel",
		"recorte",
		"collage",
		"stop motion",
		"paper",
		"manualidad"
	],
	assets: ou,
	params: {
		border: {
			type: "toggle",
			def: !0,
			label: "Borde rasgado"
		},
		width: {
			type: "range",
			min: 0,
			max: 80,
			step: 1,
			def: 25,
			label: "Grosor del borde"
		},
		roughness: {
			type: "range",
			min: 0,
			max: 80,
			step: 1,
			def: 25,
			label: "Rugosidad"
		},
		detail: {
			type: "range",
			min: .005,
			max: .08,
			step: .001,
			def: .02,
			label: "Detalle"
		},
		wrinkles: {
			type: "range",
			min: 0,
			max: 100,
			step: 1,
			def: 75,
			label: "Arrugas"
		},
		wrinkleSpeed: {
			type: "range",
			min: 0,
			max: 12,
			step: .5,
			def: 4,
			label: "Cambio de arrugas (por s)"
		},
		blend: {
			type: "select",
			options: bu,
			def: "multiply",
			label: "Fusión de arrugas"
		},
		shadow: {
			type: "toggle",
			def: !0,
			label: "Sombra"
		},
		shadowX: {
			type: "range",
			min: -40,
			max: 40,
			step: 1,
			def: 5,
			label: "Sombra X"
		},
		shadowY: {
			type: "range",
			min: -40,
			max: 40,
			step: 1,
			def: -5,
			label: "Sombra Y"
		},
		shadowBlur: {
			type: "range",
			min: 0,
			max: 40,
			step: 1,
			def: 5,
			label: "Sombra: difuminado"
		},
		shadowColor: {
			type: "color",
			def: "#000000",
			label: "Sombra: color"
		},
		shadowOpacity: {
			type: "range",
			min: 0,
			max: 100,
			step: 1,
			def: 50,
			label: "Sombra: opacidad"
		},
		jitter: {
			type: "toggle",
			def: !0,
			label: "Vibración stop-motion"
		},
		jitterSpeed: {
			type: "range",
			min: 0,
			max: 3,
			step: .05,
			def: 1,
			label: "Vibración: velocidad"
		},
		jitterStrength: {
			type: "range",
			min: 0,
			max: 3,
			step: .05,
			def: 1,
			label: "Vibración: fuerza"
		},
		fold: {
			type: "select",
			label: "Pliegue",
			def: "none",
			options: [
				{
					id: "none",
					label: "Ninguno"
				},
				{
					id: "open",
					label: "Abrir al empezar"
				},
				{
					id: "close",
					label: "Cerrar al acabar"
				},
				{
					id: "both",
					label: "Abrir y cerrar"
				}
			]
		},
		seed: {
			type: "seed",
			def: 1,
			label: "Variación"
		}
	},
	render({ ctx: e, src: t, srcRect: n, content: r, cw: i, ch: a, t: o, dur: s, params: c, seed: l }) {
		let u = Math.max(r.w, r.h), d = u / uu, f = o * 1e3, p = c.wrinkleSpeed > 0 ? Math.floor(f / (1e3 / c.wrinkleSpeed)) % 4 : 0, m = yu(c.fold, o, s), h = r.x + r.w / 2, g = r.y + r.h / 2, _ = hu("content", i, a);
		_.g.drawImage(t, n.x, n.y, n.w, n.h, r.x, r.y, r.w, r.h);
		let v = cl(`${au}/paper_overlay_${p}.webp`), y = r.w + 2 * (c.width + c.roughness) * d, b = r.h + 2 * (c.width + c.roughness) * d;
		v ? (_.g.save(), _.g.globalCompositeOperation = c.blend === "normal" ? "source-over" : c.blend, _.g.drawImage(_u(v, p, c.wrinkles), h - y / 2, g - b / 2, y, b), _.g.restore()) : (_.g.save(), _.g.globalCompositeOperation = "destination-over", _.g.fillStyle = "#ffffff", _.g.fillRect(h - y / 2, g - b / 2, y, b), _.g.restore());
		let x = Math.max(y, b);
		if (m >= 0) {
			let e = cl(`${au}/paper_fold_${m}.webp`);
			e && _.g.drawImage(e, h - x / 2, g - x / 2, x, x);
		}
		let S = hu("silhouette", i, a), C = c.border && c.width > 0 ? pu() : null;
		C && (C.dilate.setAttribute("radius", String(c.width * d)), C.disp.setAttribute("scale", String(c.roughness * d)), C.turb.setAttribute("baseFrequency", String(c.detail / Math.max(.001, d))), C.turb.setAttribute("seed", String(su[p] + (l - 1) * 7)), S.g.filter = `url(#${du})`), S.g.drawImage(t, n.x, n.y, n.w, n.h, r.x, r.y, r.w, r.h), S.g.filter = "none", _.g.globalCompositeOperation = "destination-in", _.g.drawImage(S.c, 0, 0), _.g.globalCompositeOperation = "source-over";
		let w = _.c;
		if (m >= 0) {
			let e = cl(`${au}/paper_mask_${m}.webp`);
			if (e) {
				let t = hu("fold", i, a);
				t.g.drawImage(e, h - x / 2, g - x / 2, x, x), t.g.globalCompositeOperation = "source-in", t.g.drawImage(_.c, 0, 0), w = t.c;
			}
		}
		let T = c.jitter ? vu(f, c.jitterSpeed, c.jitterStrength, l) : {
			rotation: 0,
			offsetX: 0,
			offsetY: 0
		}, E = u / 1e3;
		e.save(), c.shadow && (e.shadowColor = xu(c.shadowColor, c.shadowOpacity / 100), e.shadowBlur = c.shadowBlur * E, e.shadowOffsetX = c.shadowX * E, e.shadowOffsetY = -c.shadowY * E), e.translate(h + T.offsetX * E, g - T.offsetY * E), T.rotation && e.rotate(T.rotation * Math.PI / 180), e.drawImage(w, -h, -g), e.restore();
	}
})], Cu = [
	...Fl,
	...Rl,
	...Vl,
	...Wl,
	...ql,
	...Xl,
	...$l,
	...tu,
	...Su
], wu = /* @__PURE__ */ new Map();
for (let e of Cu) {
	if (wu.has(e.id)) throw Error(`Efecto duplicado: ${e.id}`);
	wu.set(e.id, e);
}
function Tu(e) {
	return wu.get(String(e || "")) || null;
}
//#endregion
//#region src/fx/core/runtime.js
var Eu = 1280, Du = Ol({
	maxBytes: 167772160,
	name: "fx-out"
});
function Ou(e, t) {
	let n = Number(e);
	return Number.isFinite(n) ? n : t;
}
var ku = 0;
function Au() {
	return ku += 1, `fx${Date.now().toString(36)}${ku.toString(36)}`;
}
function ju(e) {
	let t = Tu(e?.effect);
	if (!t) return null;
	let n = Math.max(0, Ou(e.from, 0)), r = e.to == null ? null : Math.max(n, Ou(e.to, n));
	return {
		uid: String(e.uid || Au()),
		effect: t.id,
		v: Math.max(1, Math.round(Ou(e.v, t.v))),
		enabled: e.enabled !== !1,
		params: hl(t, e.params),
		from: n,
		to: r
	};
}
function Mu(e) {
	let t = Array.isArray(e?.vfx) ? e.vfx : [], n = [];
	for (let e of t) {
		if (!e || e.enabled === !1) continue;
		let t = ju(e);
		t && Tu(t.effect).engine !== "generator" && n.push(t);
	}
	return n;
}
function Nu(e, t) {
	let n = e.to == null ? t : Math.min(t, e.to);
	return {
		from: Math.min(e.from, t),
		to: n
	};
}
function Pu(e, t, n) {
	return e.filter((e) => {
		let r = Nu(e, n);
		return t >= r.from && t < r.to + 1e-6;
	});
}
function Fu(e) {
	let t = 0;
	for (let n of e) t += Tu(n.effect)?.pad || 0;
	return Math.min(.5, t);
}
function Iu(e, t, n, r = Infinity) {
	let i = Math.min(1, r / Math.max(1, e, t)), a = Math.max(2, Math.round(e * i)), o = Math.max(2, Math.round(t * i)), s = n > 0 ? Math.max(1, Math.round(n * Math.min(a, o))) : 0, c = a + 2 * s, l = o + 2 * s;
	return {
		k: i,
		cw0: a,
		ch0: o,
		P: s,
		cw: c,
		ch: l,
		content: [
			s / c,
			s / l,
			(s + a) / c,
			(s + o) / l
		],
		padSrc: i > 0 ? s / i : 0
	};
}
function Lu(e, t, n, r) {
	let i = `${e}:${t}`, a = Du.get(i);
	if (!a) {
		if (typeof document > "u") return null;
		a = document.createElement("canvas"), Du.set(i, a, 0);
	}
	return (a.width !== n || a.height !== r) && (a.width = n, a.height = r, Du.resize(i, Dl(a))), a;
}
function Ru({ source: e, w: t, h: n, entries: r, t: i, clipDur: a, padAllowed: o = !1, key: s = "fx", maxSide: c = Eu, target: l = null }) {
	if (!e || !r?.length || !(t > 0) || !(n > 0)) return null;
	let u = o ? Fu(r) : 0, d = Pu(r, i, a);
	if (!d.length && !u && !l) return null;
	let f = Iu(t, n, u, c), { cw: p, ch: m, content: h } = f, g = e, _ = [
		0,
		0,
		1,
		1
	], v = null, y = d.length ? d : [null];
	for (let e = 0; e < y.length; e++) {
		if (v = e === y.length - 1 && l ? l : Lu(s, e % 2, p, m), !v) return null;
		(v.width !== p || v.height !== m) && (v.width = p, v.height = m);
		let r = v.getContext("2d");
		r.setTransform(1, 0, 0, 1, 0, 0), r.globalAlpha = 1, r.globalCompositeOperation = "source-over", r.filter = "none", r.clearRect(0, 0, p, m);
		let o = y[e], c = o && Tu(o.effect);
		if (!c) Vu(r, g, _, f);
		else {
			let e = Nu(o, a), s = Math.max(0, i - e.from), l = Math.max(.001, e.to - e.from), u = Math.floor(s * 30 + 1e-6), d = hl(c, o.params), v = Number(d.seed ?? 1) || 1;
			if (c.engine === "shader") {
				let e = wl(c, g, {
					cw: p,
					ch: m,
					srcRect: _,
					content: h,
					time: s,
					dur: l,
					frame: u,
					seed: v,
					params: d
				});
				e ? r.drawImage(e, 0, 0) : Vu(r, g, _, f);
			} else c.render({
				ctx: r,
				src: g,
				srcRect: Bu(g, _, t, n),
				content: {
					x: f.P,
					y: f.P,
					w: f.cw0,
					h: f.ch0
				},
				cw: p,
				ch: m,
				minSide: Math.min(f.cw0, f.ch0),
				scale: f.k,
				t: s,
				dur: l,
				progress: Math.min(1, s / l),
				frame: u,
				seed: v,
				params: d,
				rand: iu(v, u)
			});
		}
		g = v, _ = h;
	}
	return {
		canvas: v,
		layout: f
	};
}
function zu(e, t, n) {
	let r = Number(e?.videoWidth || e?.naturalWidth || e?.displayWidth || e?.width || 0), i = Number(e?.videoHeight || e?.naturalHeight || e?.displayHeight || e?.height || 0);
	return r && i ? {
		sw: r,
		sh: i
	} : {
		sw: t,
		sh: n
	};
}
function Bu(e, t, n, r) {
	let { sw: i, sh: a } = zu(e, n, r);
	return {
		x: t[0] * i,
		y: t[1] * a,
		w: (t[2] - t[0]) * i,
		h: (t[3] - t[1]) * a
	};
}
function Vu(e, t, n, r) {
	let i = Bu(t, n, r.cw0, r.ch0);
	try {
		e.drawImage(t, i.x, i.y, i.w, i.h, r.P, r.P, r.cw0, r.ch0);
	} catch {}
}
//#endregion
//#region src/fx/render/entry.js
function Hu(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e || []) for (let e of Tu(n.effect)?.assets || []) t.add(e);
	return [...t];
}
async function Uu(e, t) {
	if (e) try {
		await fetch(e, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(t)
		});
	} catch {}
}
function Wu(e, t, n) {
	let r = new rl({
		format: new Yc(),
		target: new Tc()
	}), i = new Wc(e, {
		codec: "vp9",
		bitrate: n,
		alpha: "keep",
		latencyMode: "quality"
	});
	return r.addVideoTrack(i, { frameRate: t }), {
		output: r,
		source: i
	};
}
async function Gu(e) {
	ol(e.assetBase || "/"), await ll(Hu(e.entries));
	let t = await new Gs({
		source: new no(e.input),
		formats: Po
	}).getPrimaryVideoTrack();
	if (!t) throw Error("La entrada no tiene vídeo.");
	let n = e.width || t.displayWidth, r = e.height || t.displayHeight, i = Mu({ vfx: e.entries }), a = Iu(n, r, e.padAllowed ? Fu(i) : 0, Infinity), o = document.createElement("canvas");
	o.width = a.cw, o.height = a.ch;
	let { output: s, source: c } = Wu(o, e.fps, e.bitrate || 16e6);
	await s.start();
	let l = new Ms(t), u = 0;
	for await (let t of l.samples()) {
		if (e.frames && u >= e.frames) {
			t.close();
			break;
		}
		let a = t.toVideoFrame();
		Ru({
			source: a,
			w: n,
			h: r,
			entries: i,
			t: u / e.fps,
			clipDur: e.clipDur,
			padAllowed: e.padAllowed,
			key: "bake",
			maxSide: Infinity,
			target: o
		}), a.close(), t.close(), await c.add(u / e.fps, 1 / e.fps), u += 1, u % 15 == 0 && Uu(e.progress, {
			done: u,
			total: e.frames || 0
		});
	}
	await s.finalize();
	let d = await fetch(e.output, {
		method: "POST",
		body: s.target.buffer
	});
	if (!d.ok) throw Error(`No se pudo entregar el horneado (${d.status}).`);
	return {
		frames: u,
		width: o.width,
		height: o.height,
		pad: a.P
	};
}
async function Ku(e) {
	ol(e.assetBase || "/");
	let t = Tu(e.effect);
	if (!t || t.engine !== "generator") throw Error(`Generador desconocido: ${e.effect}`);
	await ll(t.assets || []);
	let n = document.createElement("canvas");
	n.width = e.width, n.height = e.height;
	let r = n.getContext("2d"), { output: i, source: a } = Wu(n, e.fps, e.bitrate || 12e6);
	await i.start();
	let o = Number(e.params?.seed ?? 1) || 1;
	for (let i = 0; i < e.frames; i++) {
		let s = i / e.fps, c = Math.floor(s * 30 + 1e-6);
		r.setTransform(1, 0, 0, 1, 0, 0), r.clearRect(0, 0, n.width, n.height), t.render({
			ctx: r,
			w: n.width,
			h: n.height,
			t: s,
			dur: e.dur,
			progress: Math.min(1, s / e.dur),
			frame: c,
			seed: o,
			params: e.params,
			rand: iu(o, c)
		}), await a.add(s, 1 / e.fps), i % 15 == 0 && Uu(e.progress, {
			done: i,
			total: e.frames
		});
	}
	await i.finalize();
	let s = await fetch(e.output, {
		method: "POST",
		body: i.target.buffer
	});
	if (!s.ok) throw Error(`No se pudo entregar el horneado (${s.status}).`);
	return { frames: e.frames };
}
function qu() {
	let e = [];
	for (let t of Cu) if (t.engine === "shader") try {
		Tl(t);
	} catch (n) {
		e.push({
			id: t.id,
			error: String(n.message || n)
		});
	}
	return e;
}
window.__fx = {
	bake: Gu,
	generate: Ku,
	compileAll: qu,
	renderVfx: Ru,
	setAssetBase: ol,
	preload: ll,
	ready: !0
};
//#endregion
