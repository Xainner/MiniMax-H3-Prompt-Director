import { describe, expect, it } from "vitest";
import { makeProject } from "./testFixtures";
import {
  buildH3SkillInstructions,
  defaultH3SkillProfile,
  H3_SKILLS_SOURCE_REVISION,
  H3_STYLE_SKILLS,
  validateH3SkillProfile,
} from "./skills";
import { multiWindowSystemPrompt, writerSystemPrompt } from "./systemPrompt";

describe("MiniMax H3 skills", () => {
  it("offers the permanent base plus exactly eight optional workflows", () => {
    expect(defaultH3SkillProfile().baseId).toBe("h3-prompt-writing");
    expect(defaultH3SkillProfile().styleId).toBeNull();
    expect(defaultH3SkillProfile().sourceRevision).toBe(H3_SKILLS_SOURCE_REVISION);
    expect(H3_STYLE_SKILLS).toHaveLength(8);
    expect(new Set(H3_STYLE_SKILLS.map((skill) => skill.id)).size).toBe(8);
  });

  it("keeps adapted workflows free from unavailable Hub and canvas operations", () => {
    const catalog = JSON.stringify(H3_STYLE_SKILLS);
    expect(catalog).not.toMatch(/hub_[a-z_]+/i);
    expect(catalog).not.toMatch(/canvas/i);
  });

  it("validates only the required inputs of the selected workflow", () => {
    const profile = {
      ...defaultH3SkillProfile(),
      styleId: "minimalist-product-ad" as const,
      inputs: { product: "Camera", benefits: "Fast focus", audience: "Creators" },
    };
    expect(validateH3SkillProfile(profile)).toEqual([]);
    expect(validateH3SkillProfile({ ...profile, inputs: {} })).toHaveLength(3);
    expect(validateH3SkillProfile(profile, [])).toContain(
      "Agrega una imagen del producto para usar «Minimalist Product Ad».",
    );
    expect(validateH3SkillProfile(profile, makeProject().references)).toEqual([]);
  });

  it("composes base and selected style into normal and multi-window prompts", () => {
    const project = makeProject({
      h3Skill: {
        ...defaultH3SkillProfile(),
        styleId: "handdrawn-live-action-fusion",
        inputs: {
          physicalContact: "Ink wraps around her hand",
          setting: "Concrete studio",
          morphology: "Single black brush line",
        },
      },
    });
    const instructions = buildH3SkillInstructions(project, "full-reference");
    expect(instructions).toContain("ref-en.txt");
    expect(instructions).toContain("Handdrawn Live-Action Fusion");
    expect(instructions).toContain("Ink wraps around her hand");
    expect(instructions).toContain("MUST NOT change or reinterpret literal dialogue");
    expect(writerSystemPrompt(instructions)).toContain("Handdrawn Live-Action Fusion");
    expect(multiWindowSystemPrompt(instructions)).toContain("Handdrawn Live-Action Fusion");
  });
});
