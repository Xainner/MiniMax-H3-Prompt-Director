import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectState: {} as Record<string, unknown>,
  maestroState: {} as Record<string, unknown>,
}));

vi.mock("@/stores/projectStore", () => ({
  useProject: {
    getState: () => mocks.projectState,
    setState: (patch: Record<string, unknown>) => Object.assign(mocks.projectState, patch),
  },
}));

vi.mock("@/stores/maestroStore", () => ({
  useMaestro: { getState: () => mocks.maestroState },
}));

const { useProjectTransition } = await import("./projectTransitionStore");

describe("safe project transitions", () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const cancelLocal = vi.fn().mockResolvedValue(undefined);
  const cancelMaestro = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.projectState, {
      dirty: false,
      project: { id: "project-1" },
      generation: { status: "idle" },
      save,
      cancel: cancelLocal,
    });
    Object.assign(mocks.maestroState, { jobs: [], cancel: cancelMaestro });
    useProjectTransition.setState({ open: false, running: false, action: null });
  });

  it("runs immediately when there are no changes", async () => {
    const action = vi.fn();
    await useProjectTransition.getState().request(action);
    expect(action).toHaveBeenCalledOnce();
    expect(useProjectTransition.getState().open).toBe(false);
  });

  it("waits for a choice and discards without leaving autosave enabled", async () => {
    const action = vi.fn();
    mocks.projectState.dirty = true;
    mocks.projectState.generation = { status: "writing" };
    mocks.maestroState.jobs = [{ projectId: "project-1", status: "running" }];

    await useProjectTransition.getState().request(action);
    expect(action).not.toHaveBeenCalled();
    expect(useProjectTransition.getState().open).toBe(true);

    await useProjectTransition.getState().discardAndContinue();
    expect(cancelMaestro).toHaveBeenCalledOnce();
    expect(cancelLocal).toHaveBeenCalledOnce();
    expect(mocks.projectState.dirty).toBe(false);
    expect(action).toHaveBeenCalledOnce();
  });

  it("saves before continuing when requested", async () => {
    mocks.projectState.dirty = true;
    const action = vi.fn();
    await useProjectTransition.getState().request(action);
    await useProjectTransition.getState().saveAndContinue();
    expect(save).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
  });
});
