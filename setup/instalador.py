"""Instalador y verificador de video-yt para una PC nueva.

Abre una ventana (Tkinter) que:
  1. comprueba los requisitos del sistema (Python, Node, FFmpeg, Git) y ofrece
     instalarlos con winget;
  2. verifica cada componente (entorno Python, npm, modelos IA, recursos de
     Drive…) comparando tamaño y SHA-256 con ``setup/manifest.json``;
  3. descarga / repara lo marcado.

Sin ventana (o si falta Tkinter):
  python setup/instalador.py --verificar [--rapido]
  python setup/instalador.py --instalar [--todo | id id …]
  python setup/instalador.py --lista
"""
from __future__ import annotations

import argparse
import os
import queue
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nucleo as N  # noqa: E402

GROUP_ORDER = ["Programa", "Modelos IA", "Recursos (Drive)", "Voces TTS", "Quitar fondo"]


def default_selected(item: dict) -> bool:
    return bool(item.get("required") or item.get("default", True))


# --- modo consola -----------------------------------------------------------

def cli(args: argparse.Namespace) -> int:
    manifest = N.load_manifest()
    items = N.all_items(manifest)
    cancel = threading.Event()
    log = N.file_logger(print)
    N.refresh_path()

    if args.lista:
        for it in items:
            flag = "*" if it.get("required") else " "
            print(f"{flag} {it['id']:<16} {N.human(N.item_size(it)):>9}  {it['label']}")
        return 0

    print("== Requisitos")
    for r in N.check_requirements(manifest):
        mark = {True: "✓", False: "✗", None: "⚠"}[r.ok]
        print(f"  {mark} {r.label:<8} {r.detail}")

    cache = N.HashCache()
    tty = sys.stdout.isatty()
    last = [0.0]

    def progress(frac: float, text: str) -> None:
        now = time.monotonic()
        if tty and now - last[0] > 0.2:
            last[0] = now
            print(f"\r  {frac * 100:5.1f}%  {text[:90]:<90}", end="", flush=True)

    def clear() -> None:
        if tty:
            print("\r" + " " * 100 + "\r", end="")

    def verify(it: dict) -> N.Estado:
        st = N.verify_item(it, cache, cancel, progress, deep=not args.rapido)
        clear()
        return st

    if args.instalar:
        wanted = set(args.ids)
        todo = [it for it in items if (it["id"] in wanted) or (
            not wanted and (args.todo or default_selected(it)))]
        failed = []
        for it in todo:
            st = verify(it)
            if st.code == N.OK:
                print(f"  ✓ {it['label']}: ya está bien")
                continue
            try:
                N.install_item(it, cancel, progress, log, cache)
                clear()
                st = verify(it)
            except N.ErrorInstalacion as exc:
                clear()
                st = N.Estado(N.CORRUPTO, str(exc))
            ok = st.code in (N.OK, N.MODIFICADO, N.AVISO)
            print(f"  {'✓' if ok else '✗'} {it['label']}: {N.ESTADO_TXT[st.code]} {st.detail}")
            if not ok:
                failed.append(it["label"])
        cache.save()
        print("\nTodo listo." if not failed else "\nFallaron: " + ", ".join(failed))
        return 1 if failed else 0

    print("== Componentes")
    bad_required = 0
    for it in items:
        st = verify(it)
        if st.code not in (N.OK, N.MODIFICADO, N.AVISO) and it.get("required"):
            bad_required += 1
        print(f"  {N.ESTADO_TXT[st.code]:<28} {it['label']}  ({st.detail})")
        for b in st.bad[:5]:
            print(f"      - {b}")
    cache.save()
    return 1 if bad_required else 0


# --- ventana ----------------------------------------------------------------

def gui() -> None:
    import tkinter as tk
    from tkinter import messagebox, simpledialog, ttk
    from tkinter.scrolledtext import ScrolledText

    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:  # noqa: BLE001 - no Windows / versión vieja
        pass

    class App:
        def __init__(self, root: tk.Tk) -> None:
            self.root = root
            self.q: queue.Queue = queue.Queue()
            self.cancel = threading.Event()
            self.cache = N.HashCache()
            self.busy = False
            self.manifest = N.load_manifest()
            self.items = N.all_items(self.manifest)
            self.selected = {it["id"]: default_selected(it) for it in self.items}
            self.estados: dict[str, N.Estado] = {}     # lo que muestra la tabla
            self.results: dict[str, N.Estado] = {}     # lo que sabe el hilo de trabajo
            self.log = N.file_logger(lambda m: self.q.put(("log", m)))
            N.refresh_path()
            self._build()
            self._fill_tree()
            self.root.after(100, self._poll)
            self.root.after(300, self.verify_all)

        # -- interfaz --------------------------------------------------------
        def _build(self) -> None:
            r = self.root
            r.title("video-yt · Instalador y verificación")
            r.geometry("980x780")
            r.minsize(820, 640)
            style = ttk.Style()
            style.configure("Treeview", rowheight=26)
            style.configure("Title.TLabel", font=("Segoe UI", 14, "bold"))

            top = ttk.Frame(r, padding=(14, 10, 14, 4))
            top.pack(fill="x")
            ttk.Label(top, text="video-yt · Instalador", style="Title.TLabel").pack(anchor="w")
            info = f"Carpeta: {N.ROOT}"
            if self.manifest.get("generado"):
                info += f"   ·   Manifiesto del {self.manifest['generado']}"
            else:
                info += "   ·   ⚠ No hay setup/manifest.json: solo se instalará el programa"
            ttk.Label(top, text=info, foreground="#666").pack(anchor="w")

            self.req_box = ttk.LabelFrame(r, text=" 1 · Requisitos del sistema ", padding=8)
            self.req_box.pack(fill="x", padx=14, pady=6)
            ttk.Label(self.req_box, text="Comprobando…").grid(row=0, column=0, sticky="w")

            comp = ttk.LabelFrame(r, text=" 2 · Componentes (clic en ☐ para marcar) ",
                                  padding=8)
            comp.pack(fill="both", expand=True, padx=14, pady=6)
            self.tree = ttk.Treeview(comp, columns=("tam", "estado"), show="tree headings",
                                     selectmode="browse", height=12)
            self.tree.heading("#0", text="Componente")
            self.tree.heading("tam", text="Tamaño")
            self.tree.heading("estado", text="Estado")
            self.tree.column("#0", width=470)
            self.tree.column("tam", width=90, anchor="e")
            self.tree.column("estado", width=330)
            self.tree.tag_configure("ok", foreground="#1b7f3b")
            self.tree.tag_configure("bad", foreground="#c62828")
            self.tree.tag_configure("warn", foreground="#b26a00")
            self.tree.tag_configure("group", font=("Segoe UI", 9, "bold"))
            sb = ttk.Scrollbar(comp, orient="vertical", command=self.tree.yview)
            self.tree.configure(yscrollcommand=sb.set)
            self.tree.grid(row=0, column=0, sticky="nsew")
            sb.grid(row=0, column=1, sticky="ns")
            comp.rowconfigure(0, weight=1)
            comp.columnconfigure(0, weight=1)
            self.tree.bind("<Button-1>", self._on_click)
            self.tree.bind("<<TreeviewSelect>>", self._on_select)
            self.tree.bind("<Double-1>", lambda e: self.edit_link())

            row = ttk.Frame(comp)
            row.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(6, 0))
            self.detail = ttk.Label(row, text="", foreground="#555", wraplength=640)
            self.detail.pack(side="left", fill="x", expand=True)
            self.btn_link = ttk.Button(row, text="Enlace de Drive…", command=self.edit_link,
                                       state="disabled")
            self.btn_link.pack(side="right")
            self.deep = tk.BooleanVar(value=True)
            ttk.Checkbutton(row, text="Verificar SHA-256", variable=self.deep).pack(
                side="right", padx=8)

            prog = ttk.Frame(r, padding=(14, 0))
            prog.pack(fill="x")
            self.pbar = ttk.Progressbar(prog, maximum=1.0)
            self.pbar.pack(fill="x")
            self.ptext = ttk.Label(prog, text="", foreground="#555")
            self.ptext.pack(anchor="w")

            self.logbox = ScrolledText(r, height=9, font=("Consolas", 9), state="disabled",
                                       wrap="word")
            self.logbox.pack(fill="both", expand=False, padx=14, pady=4)

            bar = ttk.Frame(r, padding=(14, 4, 14, 12))
            bar.pack(fill="x")
            self.btn_verify = ttk.Button(bar, text="Verificar", command=self.verify_all)
            self.btn_install = ttk.Button(bar, text="Instalar / reparar marcados",
                                          command=self.install_selected)
            self.btn_cancel = ttk.Button(bar, text="Cancelar", command=self.cancel.set,
                                         state="disabled")
            self.btn_verify.pack(side="left")
            self.btn_install.pack(side="left", padx=6)
            self.btn_cancel.pack(side="left")
            ttk.Button(bar, text="Iniciar video-yt", command=self.launch).pack(side="right")
            ttk.Button(bar, text="Abrir registro", command=lambda: self._open(N.LOG_FILE)).pack(
                side="right", padx=6)

        def _fill_tree(self) -> None:
            self.tree.delete(*self.tree.get_children())
            groups = []
            for it in self.items:
                g = it.get("group", "Otros")
                if g not in groups:
                    groups.append(g)
            groups.sort(key=lambda g: GROUP_ORDER.index(g) if g in GROUP_ORDER else 99)
            for g in groups:
                members = [it for it in self.items if it.get("group", "Otros") == g]
                size = sum(N.item_size(it) for it in members)
                self.tree.insert("", "end", iid="g:" + g, text=g, open=True,
                                 values=(N.human(size), ""), tags=("group",))
                for it in members:
                    self.tree.insert("g:" + g, "end", iid=it["id"], text=self._label(it),
                                     values=(N.human(N.item_size(it)), "…"))

        def _label(self, it: dict) -> str:
            box = "☑" if self.selected[it["id"]] else "☐"
            req = "  (obligatorio)" if it.get("required") else ""
            return f"{box}  {it['label']}{req}"

        def _set_estado(self, iid: str, st: N.Estado) -> None:
            self.estados[iid] = st
            tag = {N.OK: "ok", N.MODIFICADO: "warn", N.AVISO: "warn",
                   N.SIN_FUENTE: "warn"}.get(st.code, "bad")
            text = N.ESTADO_TXT[st.code] + (f" · {st.detail}" if st.detail else "")
            if self.tree.exists(iid):
                self.tree.set(iid, "estado", text)
                self.tree.item(iid, tags=(tag,))
            self._on_select()

        def _on_click(self, event) -> None:
            if self.tree.identify_region(event.x, event.y) not in ("tree", "cell"):
                return
            iid = self.tree.identify_row(event.y)
            if not iid or self.tree.identify_column(event.x) != "#0":
                return
            # Solo si el clic cae sobre la casilla (los primeros píxeles del texto).
            bbox = self.tree.bbox(iid, "#0")
            depth = 1 if iid.startswith("g:") else 2
            if bbox and event.x > bbox[0] + 20 * depth + 26:
                return
            if iid.startswith("g:"):
                kids = self.tree.get_children(iid)
                value = not all(self.selected[k] for k in kids)
                for k in kids:
                    self.selected[k] = value
            else:
                self.selected[iid] = not self.selected[iid]
            for it in self.items:
                if self.tree.exists(it["id"]):
                    self.tree.item(it["id"], text=self._label(it))

        def _on_select(self, _event=None) -> None:
            sel = self.tree.selection()
            it = self._item(sel[0]) if sel else None
            if not it:
                self.detail.config(text="")
                self.btn_link.config(state="disabled")
                return
            st = self.estados.get(it["id"])
            lines = [f"{it['label']} → {it.get('dest', '(sistema)')}"]
            if st and st.bad:
                more = f" (+{len(st.bad) - 4} más)" if len(st.bad) > 4 else ""
                lines.append("Problemas: " + "; ".join(st.bad[:4]) + more)
            if "zip" in it:
                src = it["zip"].get("sources") or ["(sin enlace)"]
                lines.append("Origen: " + src[0])
            self.detail.config(text="\n".join(lines))
            self.btn_link.config(state="normal" if "zip" in it and not self.busy else "disabled")

        def _item(self, iid: str):
            return next((it for it in self.items if it["id"] == iid), None)

        # -- acciones --------------------------------------------------------
        def edit_link(self) -> None:
            sel = self.tree.selection()
            it = self._item(sel[0]) if sel else None
            if not it or "zip" not in it or self.busy:
                return
            cur = (it["zip"].get("sources") or [""])[0]
            url = simpledialog.askstring(
                "Enlace de descarga",
                f"Enlace de Google Drive (u otro enlace directo) para:\n{it['label']}\n\n"
                "El archivo debe estar compartido como «Cualquier persona con el enlace».",
                initialvalue=cur, parent=self.root)
            if url is None:
                return
            url = url.strip()
            try:
                if url:
                    N.drive_id(url)
            except N.ErrorInstalacion as exc:
                messagebox.showerror("Enlace no válido", str(exc), parent=self.root)
                return
            for m in self.manifest.get("items", []):
                if m["id"] == it["id"]:
                    m["zip"]["sources"] = [url] if url else []
            N.save_manifest(self.manifest)
            it["zip"]["sources"] = [url] if url else []
            self.log(f"• Enlace de «{it['label']}» guardado en setup/manifest.json")
            self._run(self._verify_job, [it], False, self.deep.get())

        def verify_all(self) -> None:
            self._run(self._verify_job, list(self.items), True, self.deep.get())

        def install_selected(self) -> None:
            todo = [it for it in self.items if self.selected[it["id"]]]
            if not todo:
                messagebox.showinfo("Nada marcado", "Marca al menos un componente.",
                                    parent=self.root)
                return
            if any(it["id"] == "proyectos" for it in todo) and not messagebox.askyesno(
                    "Proyectos",
                    "Instalar «Mis proyectos» SOBRESCRIBE los proyectos que haya en esta PC "
                    "(los ajustes y API keys de aquí se conservan).\n\n¿Continuar?",
                    parent=self.root):
                return
            self._run(self._install_job, todo, self.deep.get())

        def install_req(self, req: N.Req) -> None:
            self._run(self._winget_job, req)

        def launch(self) -> None:
            bat = N.ROOT / "start.bat"
            if not N.VENV_PY.exists() or not (N.FRONTEND / "node_modules").is_dir():
                if not messagebox.askyesno(
                        "Falta instalar", "El entorno Python o el frontend no están "
                        "instalados. ¿Iniciar igualmente?", parent=self.root):
                    return
            os.startfile(bat)  # type: ignore[attr-defined]

        def _open(self, path: Path) -> None:
            if path.exists():
                os.startfile(path)  # type: ignore[attr-defined]

        # -- trabajos en segundo plano --------------------------------------
        def _run(self, fn, *args) -> None:
            if self.busy:
                return
            self.busy = True
            self.cancel.clear()
            for b in (self.btn_verify, self.btn_install, self.btn_link):
                b.config(state="disabled")
            self.btn_cancel.config(state="normal")

            def work() -> None:
                try:
                    fn(*args)
                except N.Cancelado:
                    self.log("✗ Cancelado.")
                except Exception as exc:  # noqa: BLE001 - que la ventana no muera
                    self.log(f"✗ Error inesperado: {exc!r}")
                finally:
                    self.cache.save()
                    self.q.put(("done", None))
            threading.Thread(target=work, daemon=True).start()

        def _progress(self, frac: float, text: str) -> None:
            self.q.put(("progress", frac, text))

        def _verify_job(self, items: list[dict], with_reqs: bool, deep: bool) -> None:
            if with_reqs:
                self.q.put(("reqs", N.check_requirements(self.manifest)))
            for it in items:
                self.q.put(("estado", it["id"], N.Estado(N.AVISO, "verificando…")))
                try:
                    st = N.verify_item(it, self.cache, self.cancel, self._progress, deep)
                except N.Cancelado:
                    raise
                except Exception as exc:  # noqa: BLE001
                    st = N.Estado(N.AVISO, f"no se pudo verificar: {exc}")
                self.results[it["id"]] = st
                self.q.put(("estado", it["id"], st))
            self._progress(1.0, "Verificación terminada")
            bad = [it["label"] for it in items if it.get("required")
                   and self.results[it["id"]].code not in (N.OK, N.MODIFICADO, N.AVISO)]
            if with_reqs:
                self.log("✓ Todo lo obligatorio está correcto." if not bad else
                         "✗ Falta o está dañado: " + ", ".join(bad) +
                         " → pulsa «Instalar / reparar marcados».")

        def _install_job(self, items: list[dict], deep: bool) -> None:
            failed, done = [], []
            for it in items:
                if self.cancel.is_set():
                    raise N.Cancelado()
                st = self.results.get(it["id"])
                if st is None or st.code != N.OK:
                    st = N.verify_item(it, self.cache, self.cancel, self._progress, deep)
                if st.code == N.OK:
                    continue
                self.log(f"\n▶ {it['label']}")
                self.q.put(("estado", it["id"], N.Estado(N.AVISO, "instalando…")))
                try:
                    N.install_item(it, self.cancel, self._progress, self.log, self.cache)
                    st = N.verify_item(it, self.cache, self.cancel, self._progress, True)
                except N.Cancelado:
                    raise
                except N.ErrorInstalacion as exc:
                    st = N.Estado(N.CORRUPTO, str(exc)[:120])
                    self.log(f"✗ {exc}")
                self.results[it["id"]] = st
                self.q.put(("estado", it["id"], st))
                if st.code in (N.OK, N.MODIFICADO, N.AVISO):
                    done.append(it["label"])
                    self.log(f"✓ {it['label']}: listo")
                else:
                    failed.append(it["label"])
            self._progress(1.0, "Instalación terminada")
            self.q.put(("summary", done, failed))

        def _winget_job(self, req: N.Req) -> None:
            self.log(f"\n▶ Instalando {req.label} con winget ({req.winget})…")
            try:
                N.winget_install(req.winget, self.log, self.cancel)
                self.log(f"✓ {req.label} instalado")
            except N.ErrorInstalacion as exc:
                self.log(f"✗ {exc}")
            if req.id == "python":
                self.log("  Cierra esta ventana y vuelve a abrir instalar.bat para usar "
                         "el Python nuevo.")
            self.q.put(("reqs", N.check_requirements(self.manifest)))

        # -- cola → interfaz --------------------------------------------------
        def _poll(self) -> None:
            try:
                while True:
                    msg = self.q.get_nowait()
                    kind = msg[0]
                    if kind == "log":
                        self._append(msg[1])
                    elif kind == "progress":
                        self.pbar["value"] = max(0.0, min(1.0, msg[1]))
                        self.ptext.config(text=msg[2])
                    elif kind == "estado":
                        self._set_estado(msg[1], msg[2])
                    elif kind == "reqs":
                        self._show_reqs(msg[1])
                    elif kind == "summary":
                        self._summary(msg[1], msg[2])
                    elif kind == "done":
                        self.busy = False
                        self.btn_verify.config(state="normal")
                        self.btn_install.config(state="normal")
                        self.btn_cancel.config(state="disabled")
                        self._on_select()
            except queue.Empty:
                pass
            self.root.after(80, self._poll)

        def _append(self, text: str) -> None:
            self.logbox.config(state="normal")
            self.logbox.insert("end", text + "\n")
            self.logbox.see("end")
            self.logbox.config(state="disabled")

        def _show_reqs(self, reqs: list[N.Req]) -> None:
            for w in self.req_box.winfo_children():
                w.destroy()
            has_winget = any(r.id == "winget" and r.ok for r in reqs)
            for i, r in enumerate(reqs):
                mark, color = {True: ("✓", "#1b7f3b"), False: ("✗", "#c62828"),
                               None: ("⚠", "#b26a00")}[r.ok]
                ttk.Label(self.req_box, text=mark, foreground=color,
                          font=("Segoe UI", 10, "bold")).grid(row=i, column=0, padx=(0, 6))
                ttk.Label(self.req_box, text=r.label, width=9).grid(row=i, column=1, sticky="w")
                ttk.Label(self.req_box, text=r.detail, foreground="#444").grid(
                    row=i, column=2, sticky="w")
                if r.ok is not True and r.winget and has_winget:
                    ttk.Button(self.req_box, text="Instalar con winget",
                               command=lambda r=r: self.install_req(r)).grid(
                        row=i, column=3, sticky="e", padx=4, pady=1)
            self.req_box.columnconfigure(2, weight=1)
            missing = [r.label for r in reqs if r.ok is False and r.required]
            if missing:
                self.log("⚠ Requisitos que faltan: " + ", ".join(missing))

        def _summary(self, done: list[str], failed: list[str]) -> None:
            if failed:
                messagebox.showwarning(
                    "Instalación con errores",
                    "No se pudo completar:\n  • " + "\n  • ".join(failed) +
                    "\n\nMira el registro (abajo) y vuelve a pulsar «Instalar / reparar».",
                    parent=self.root)
            else:
                extra = ("\n\nRecuerda: las API keys no viajan en el Drive; ponlas en "
                         "Ajustes del editor o copia backend/data/settings.json a mano.")
                messagebox.showinfo(
                    "Listo", ("Instalado: " + ", ".join(done) if done else
                              "Todo estaba ya correcto.") + extra, parent=self.root)

    root = tk.Tk()
    App(root)
    root.mainloop()


def main() -> None:
    ap = argparse.ArgumentParser(description="Instalador / verificador de video-yt")
    ap.add_argument("--verificar", action="store_true", help="verifica y sale (consola)")
    ap.add_argument("--rapido", action="store_true", help="solo tamaños, sin SHA-256")
    ap.add_argument("--instalar", action="store_true", help="instala por consola")
    ap.add_argument("--todo", action="store_true", help="con --instalar: también lo opcional")
    ap.add_argument("--lista", action="store_true", help="lista los componentes")
    ap.add_argument("ids", nargs="*", help="con --instalar: solo estos componentes")
    args = ap.parse_args()
    if args.verificar or args.instalar or args.lista:
        sys.exit(cli(args))
    try:
        import tkinter  # noqa: F401
    except ImportError:
        print("Tkinter no está disponible: modo consola (--verificar / --instalar).")
        args.verificar = True
        sys.exit(cli(args))
    gui()


if __name__ == "__main__":
    main()
