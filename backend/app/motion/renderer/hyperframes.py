"""Motor HyperFrames: render determinista con Chromium headless (Playwright).

Carga el HTML/CSS/GSAP de la composición, busca la timeline GSAP (pausada) a
cada frame exacto ``i/fps`` con ``__seek(t)`` y captura un PNG con alfa. Luego
ensambla la secuencia en un WebM VP9 con canal alfa (yuva420p) que compose.py
puede componer como overlay sobre la timeline principal.

Determinismo (spec §8): la timeline está ``paused``; el tiempo lo fija seek(t),
no el reloj real ni requestAnimationFrame. Sin random no sembrado.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

from ..generator import generate_html
from ..models import MotionComposition
from .adapter import RenderResult

log = logging.getLogger(__name__)

_READY_TIMEOUT_MS = 20000
_NAV_TIMEOUT_MS = 20000
INSTALL_HINT = (
    "Falta Playwright/Chromium. Instala con: pip install playwright && "
    "python -m playwright install chromium"
)


class HyperFramesRenderer:
    def available(self) -> tuple[bool, str]:
        try:
            import playwright  # noqa: F401
            from playwright.sync_api import sync_playwright  # noqa: F401
        except Exception:  # noqa: BLE001
            return False, INSTALL_HINT
        return True, ""

    def render(self, comp: MotionComposition, out_path: Path, on_progress) -> RenderResult:
        ok, reason = self.available()
        if not ok:
            raise RuntimeError(reason)
        from playwright.sync_api import sync_playwright

        fps = int(comp.fps or 30)
        total = max(1, round(float(comp.duration) * fps))
        html = generate_html(comp)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        on_progress(0.05, "Preparando composición…")
        with tempfile.TemporaryDirectory(prefix="mg-frames-") as td:
            frames_dir = Path(td)
            self._capture_frames(sync_playwright, html, comp, fps, total, frames_dir, on_progress)
            on_progress(0.9, "Ensamblando vídeo con alfa…")
            self._assemble(frames_dir, out_path, fps)

        if not out_path.exists():
            raise RuntimeError("El render no generó ningún archivo.")
        on_progress(1.0, "Motion graphic listo.")
        return RenderResult(path=out_path, frames=total, width=comp.width,
                            height=comp.height, fps=fps, has_alpha=True)

    def capture_frames_at(self, comp: MotionComposition, times: list[float]) -> list[bytes]:
        """Captura PNG (con alfa) en los instantes ``times`` reutilizando UNA página.

        Comparte el motor y el HTML del render → los frames son idénticos a los del
        vídeo final (paridad). Pensado para verificación rápida (1 frame ≈ 1-2 s).
        """
        ok, reason = self.available()
        if not ok:
            raise RuntimeError(reason)
        from playwright.sync_api import sync_playwright

        dur = float(comp.duration or 0)
        html = generate_html(comp)
        clip = {"x": 0, "y": 0, "width": comp.width, "height": comp.height}
        out: list[bytes] = []
        with sync_playwright() as p:
            browser = self._launch(p)
            try:
                page = self._ready_page(browser, comp, html)
                for t in times:
                    tt = max(0.0, min(float(t), dur))
                    page.evaluate("(t) => window.__seek(t)", tt)
                    out.append(page.screenshot(omit_background=True, clip=clip))
            finally:
                browser.close()
        return out

    def _launch(self, p):
        return p.chromium.launch(args=[
            "--force-color-profile=srgb",
            "--hide-scrollbars",
            "--disable-lcd-text",
        ])

    def _ready_page(self, browser, comp, html):
        page = browser.new_page(
            viewport={"width": comp.width, "height": comp.height},
            device_scale_factor=1,
        )
        page.set_default_timeout(_NAV_TIMEOUT_MS)
        page.set_content(html, wait_until="load")
        page.wait_for_function("window.__motionReady === true", timeout=_READY_TIMEOUT_MS)
        try:
            page.evaluate("() => document.fonts && document.fonts.ready")
        except Exception:  # noqa: BLE001
            pass
        return page

    def _capture_frames(self, sync_playwright, html, comp, fps, total, frames_dir, on_progress):
        with sync_playwright() as p:
            browser = self._launch(p)
            try:
                page = self._ready_page(browser, comp, html)
                clip = {"x": 0, "y": 0, "width": comp.width, "height": comp.height}
                for i in range(total):
                    t = i / fps
                    page.evaluate("(t) => window.__seek(t)", t)
                    page.screenshot(
                        path=str(frames_dir / f"frame_{i:05d}.png"),
                        omit_background=True,
                        clip=clip,
                    )
                    if i % 5 == 0 or i == total - 1:
                        on_progress(0.05 + 0.85 * (i + 1) / total,
                                    f"Renderizando frame {i + 1}/{total}…")
            finally:
                browser.close()

    def _assemble(self, frames_dir: Path, out_path: Path, fps: int) -> None:
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", str(frames_dir / "frame_%05d.png"),
            "-c:v", "libvpx-vp9",
            "-pix_fmt", "yuva420p",
            "-b:v", "0", "-crf", "24",
            "-auto-alt-ref", "0",
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg falló al ensamblar el motion graphic:\n{proc.stderr[-800:]}")
