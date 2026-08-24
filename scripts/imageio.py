"""One place that writes an image file, so nothing writes a lossy one by mistake.

The served artwork is lossless WebP. Pillow picks its format from the file
extension, and its DEFAULT for WebP is lossy — so `image.save(path)` on a
`.webp` path silently re-encodes pixel art at quality 80, which for
hard-edged palettised sprites is visible immediately and irreversible.

Two scripts in this pipeline rewrite art in place — `fit_resolution.py` and
`regrade.py` — and both did it with a bare `save`. That was correct while
everything was PNG and became a trap the moment it was not. Hence one function,
used by both, that knows the rule.
"""
from pathlib import Path


def save_art(image, path, **extra):
    """Writes an image losslessly, whatever its extension asks for.

    @param image  a Pillow image
    @param path   destination; its suffix picks the format
    """
    path = Path(path)
    suffix = path.suffix.lower()

    if suffix == ".webp":
        # `lossless` is the whole point. `method=6` is the slowest, smallest
        # setting, which is right for something written once and served forever.
        image.save(path, "WEBP", lossless=True, quality=100, method=6, **extra)
    elif suffix == ".png":
        image.save(path, "PNG", optimize=True, **extra)
    else:
        raise ValueError(f"refusing to write art to an unknown format: {path}")


def art_files(directory):
    """Every served image in a directory, whatever format it is in."""
    return sorted(
        p for p in Path(directory).rglob("*")
        if p.suffix.lower() in (".png", ".webp")
    )
