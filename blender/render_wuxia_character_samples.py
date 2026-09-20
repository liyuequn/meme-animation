"""Render five evidence frames and the full MCP-built character animation."""

from pathlib import Path
import bpy

out = Path("/Users/apple/Documents/ChatGPT/meme-animation/exports/wuxia-character-mcp")
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 540
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"

samples = sorted({round(scene.frame_start + (scene.frame_end - scene.frame_start) * i / 4) for i in range(5)})
(out / "stills").mkdir(parents=True, exist_ok=True)
for frame in samples:
    scene.frame_set(frame)
    scene.render.filepath = str(out / "stills" / f"frame_{frame:04d}.png")
    bpy.ops.render.render(write_still=True)

frames = out / "frames"
frames.mkdir(parents=True, exist_ok=True)
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(frames / "frame_")
bpy.ops.render.render(animation=True)
