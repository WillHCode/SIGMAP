export type Transform = {
    scale: number;
    tx: number;
    ty: number;
};

export type MovementOptions = {
    minScale?: number;
    maxScale?: number;
    zoomSpeed?: number;
    keyboardPan?: number;
    inertia?: boolean;
    wrapX?: boolean;
    applyCssTransforms?: boolean;
};

export class MovementHandler {
    private container: HTMLElement;
    private targets: HTMLElement[] = [];
    private transform: Transform = { scale: 1, tx: 0, ty: 0 };
    private opts: Required<MovementOptions>;

    // pointer state
    private pointers = new Map<number, { x: number; y: number }>();
    private lastPanPoint: { x: number; y: number } | null = null;
    private lastPinchDist: number | null = null;
    private lastPinchCenter: { x: number; y: number } | null = null;

    // callback
    public onChange: ((t: Transform) => void) | null = null;

    constructor(container: HTMLElement, options?: MovementOptions) {
        this.container = container;
        const optMin = options?.minScale ?? 1;
        this.opts = {
            minScale: Math.max(1, optMin),
            maxScale: options?.maxScale ?? 16,
            zoomSpeed: options?.zoomSpeed ?? 0.0025,
            keyboardPan: options?.keyboardPan ?? 100,
            inertia: options?.inertia ?? false,
            wrapX: options?.wrapX ?? false,
            applyCssTransforms: options?.applyCssTransforms ?? true,
        };

        this.container.style.touchAction = "none";
        this.container.addEventListener("wheel", this.onWheel, { passive: false });
        this.container.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointerup", this.onPointerUp);
        window.addEventListener("pointercancel", this.onPointerUp);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("resize", this.onResize);
    }

    addTarget(el: HTMLElement) {
        el.style.transformOrigin = "0 0";
        this.targets.push(el);
        if (this.opts.applyCssTransforms) this.applyToElement(el);
    }

    setTransform(t: Transform, emit = true) {
        this.transform = this.sanitizeTransform(t);
        if (this.opts.applyCssTransforms) {
            this.applyToTargets();
        }
        if (emit && this.onChange) this.onChange(this.getTransform());
    }

    getTransform() { return { ...this.transform }; }

    applyToTargets() {
        for (const el of this.targets) this.applyToElement(el);
    }

    private applyToElement(el: HTMLElement) {
        const { scale, tx, ty } = this.transform;
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    }

    private getBaseSize() {
        const W = this.container.clientWidth || 1;
        const H = this.container.clientHeight || 1;
        return { W, H };
    }

    private sanitizeTransform(t: Transform): Transform {
        const { W, H } = this.getBaseSize();

        // clamp scale
        let s = Math.max(this.opts.minScale, Math.min(this.opts.maxScale, t.scale));

        // vertical clamp always enforced
        const minTy = H * (1 - s);
        const maxTy = 0;
        let ty = Math.max(minTy, Math.min(maxTy, t.ty));

        let tx: number;
        if (this.opts.wrapX) {
            tx = t.tx;
        } else {
            const minTx = W * (1 - s);
            const maxTx = 0;
            tx = Math.max(minTx, Math.min(maxTx, t.tx));
        }

        if (!isFinite(tx) || !isFinite(ty)) { tx = 0; ty = 0; }

        return { scale: s, tx, ty };
    }

    private clientToLocal(clientX: number, clientY: number) {
        const rect = this.container.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    private onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY;
        const wheelFactor = Math.exp(-delta * this.opts.zoomSpeed);
        const local = this.clientToLocal(e.clientX, e.clientY);

        const beforeWorldX = (local.x - this.transform.tx) / this.transform.scale;
        const beforeWorldY = (local.y - this.transform.ty) / this.transform.scale;

        let newScale = this.transform.scale * wheelFactor;
        let newTx = local.x - beforeWorldX * newScale;
        let newTy = local.y - beforeWorldY * newScale;

        this.setTransform({ scale: newScale, tx: newTx, ty: newTy });
    };

    private onPointerDown = (e: PointerEvent) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        this.pointers.set(e.pointerId, this.clientToLocal(e.clientX, e.clientY));

        if (this.pointers.size === 1) {
            this.lastPanPoint = this.clientToLocal(e.clientX, e.clientY);
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        } else if (this.pointers.size === 2) {
            const pts = Array.from(this.pointers.values());
            this.lastPinchDist = this.dist(pts[0], pts[1]);
            this.lastPinchCenter = this.midpoint(pts[0], pts[1]);
            this.lastPanPoint = null;
        } else {
            this.lastPanPoint = null;
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        }
    };

    private onPointerUp = (e: PointerEvent) => {
        try {
            (e.target as Element).releasePointerCapture?.(e.pointerId);
        }
        catch {
            throw new DOMException('Pointer capture release failed');
        }
        this.pointers.delete(e.pointerId);

        if (this.pointers.size === 1) {
            const pts = Array.from(this.pointers.values());
            this.lastPanPoint = pts[0];
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        } else {
            this.lastPanPoint = null;
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        }
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.pointers.has(e.pointerId)) return;
        const local = this.clientToLocal(e.clientX, e.clientY);
        this.pointers.set(e.pointerId, local);

        if (this.pointers.size === 1 && this.lastPanPoint) {
            const dx = local.x - this.lastPanPoint.x;
            const dy = local.y - this.lastPanPoint.y;
            this.lastPanPoint = local;

            this.setTransform({
                scale: this.transform.scale,
                tx: this.transform.tx + dx,
                ty: this.transform.ty - dy
            });
            return;
        }

        if (this.pointers.size === 2) {
            const pts = Array.from(this.pointers.values());
            const curDist = this.dist(pts[0], pts[1]);
            const curCenter = this.midpoint(pts[0], pts[1]);
            if (this.lastPinchDist == null || this.lastPinchCenter == null) {
                this.lastPinchDist = curDist;
                this.lastPinchCenter = curCenter;
                return;
            }
            if (curDist === 0 || this.lastPinchDist === 0) return;

            const factor = curDist / this.lastPinchDist;
            let newScale = this.transform.scale * factor;

            // zoom around the pinch center
            const beforeWorldX = (curCenter.x - this.transform.tx) / this.transform.scale;
            const beforeWorldY = (curCenter.y - this.transform.ty) / this.transform.scale;
            const newTx = curCenter.x - beforeWorldX * newScale;
            const newTy = curCenter.y - beforeWorldY * newScale;

            this.lastPinchDist = curDist;
            this.lastPinchCenter = curCenter;
            this.setTransform({ scale: newScale, tx: newTx, ty: -newTy });
        }
    };

    private onKeyDown = (ev: KeyboardEvent) => {
        const panStep = this.opts.keyboardPan;
        let handled = false;
        if (ev.key === "ArrowLeft") {
            this.setTransform({ ...this.transform, tx: this.transform.tx + panStep });
            handled = true;
        } else if (ev.key === "ArrowRight") {
            this.setTransform({ ...this.transform, tx: this.transform.tx - panStep });
            handled = true;
        } else if (ev.key === "ArrowUp") {
            this.setTransform({ ...this.transform, ty: this.transform.ty - panStep });
            handled = true;
        } else if (ev.key === "ArrowDown") {
            this.setTransform({ ...this.transform, ty: this.transform.ty + panStep });
            handled = true;
        } else if (ev.key === "+" || ev.key === "=") {
            const rect = this.container.getBoundingClientRect();
            const cx = rect.width / 2, cy = rect.height / 2;
            const factor = 1.1;
            this.zoomAround(cx, cy, factor);
            handled = true;
        } else if (ev.key === "-" || ev.key === "_") {
            this.zoomAround(this.container.clientWidth / 2, this.container.clientHeight / 2, 1 / 1.1);
            handled = true;
        }

        if (handled) ev.preventDefault();
    };

    private zoomAround(localX: number, localY: number, factor: number) {
        const beforeWorldX = (localX - this.transform.tx) / this.transform.scale;
        const beforeWorldY = (localY - this.transform.ty) / this.transform.scale;
        let newScale = this.transform.scale * factor;
        const newTx = localX - beforeWorldX * newScale;
        const newTy = localY - beforeWorldY * newScale;
        this.setTransform({ scale: newScale, tx: newTx, ty: newTy });
    }

    private dist(a: { x: number; y: number }, b: { x: number; y: number }) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    private midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    private onResize = () => {
        // Re-sanitize transform when the container size changes
        this.setTransform(this.transform, true);
    };

    dispose() {
        this.container.removeEventListener("wheel", this.onWheel);
        this.container.removeEventListener("pointerdown", this.onPointerDown);
        window.removeEventListener("pointerup", this.onPointerUp);
        window.removeEventListener("pointercancel", this.onPointerUp);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("resize", this.onResize);
    }
}
