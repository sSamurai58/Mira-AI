---
id: blender-scene
name: Blender Scene
description: On-demand skill для задач в Blender — сцена, примитивы, свет, камера.
triggers: blender, bpy, сцена, куб, 3d scene, моделирование
enabled: false
---

# Blender Scene

Этот skill подключается **только** на время задачи Blender (on-demand).

1. Работай через tool `tools.blender` / результат bpy-скрипта в контексте.
2. Для демо-сцены: куб + источник света + камера; сохрани `.blend` если live.
3. Если режим dry-run — честно скажи, что Blender не запущен, но скрипт/манифест подготовлены.
4. Не предлагай другие 3D-пакеты; не включай лишние skills.
5. После задачи skill снова неактивен — не «держи» Blender в контексте дальше.
