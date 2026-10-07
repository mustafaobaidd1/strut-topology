/** Lets other components ask the viewport for a composited image of the current view. */
export const viewportApi: { snapshot: (() => HTMLCanvasElement | null) | null } = {
  snapshot: null,
};
