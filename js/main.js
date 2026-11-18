// Starts the scene named in `?scene=`, or the pixel tatami room.
window.Stage.run(new URLSearchParams(location.search).get('scene') || 'tatami-pixel');
