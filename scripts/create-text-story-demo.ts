import assert from "node:assert/strict";

import { db } from "../src/server/database";
import { projectCommandService } from "../src/server/project-command-service";
import { backgroundService, projectService } from "../src/server/services";
import { fakeTextBlocks } from "../src/shared/project-timeline";

const demoName = "Text Story Demo — The Second Account";

try {
  const existing = projectService.list().find((project) => project.name === demoName);
  if (existing) {
    console.log(JSON.stringify({ created: false, projectId: existing.id, name: existing.name, url: `/projects/${existing.id}` }, null, 2));
    process.exitCode = 0;
  } else {
    const background = backgroundService.list()[0];
    assert.ok(background, "Add at least one gameplay video to the Background Library before creating the demo.");

    const created = projectService.create({
      name: demoName,
      description: "DialogueLab-style iMessage story over vertical Minecraft gameplay.",
      projectType: "fake-text",
      width: 1080,
      height: 1920,
      fps: 30,
    });
    const starters = fakeTextBlocks(created.editorState);
    assert.equal(starters.length, 4);

    const result = projectCommandService.apply({
      localProjectId: created.id,
      expectedRevision: created.revision,
      source: "system",
      summary: "Created Text Story showcase",
      commands: [
        { kind: "configure-stage", backgroundId: background.id, backgroundStartSeconds: Math.min(12, Math.max(0, background.durationSeconds - 1)) },
        { kind: "set-fake-text-settings", patch: {
          senderName: "Jake",
          contactName: "Jessica",
          phoneTheme: "light",
          phoneScalePercent: 90,
          gameplayDimPercent: 0,
          unreadCount: 92,
          showHeader: true,
          incomingBubbleColor: "#E9E9EB",
          incomingTextColor: "#000000",
          outgoingBubbleColor: "#007AFF",
          outgoingTextColor: "#FFFFFF",
          showSenders: false,
          showTypingIndicator: true,
          staggerSeconds: 1.2,
          holdSeconds: 2.5,
        } },
        { kind: "update-fake-text-message", messageId: starters[0].id, patch: { side: "incoming", sender: "Jessica", text: "jake, we need to talk" } },
        { kind: "update-fake-text-message", messageId: starters[1].id, patch: { side: "outgoing", sender: "Jake", text: "about?" } },
        { kind: "update-fake-text-message", messageId: starters[2].id, patch: { side: "incoming", sender: "Jessica", text: "i found the second account" } },
        { kind: "update-fake-text-message", messageId: starters[3].id, patch: { side: "outgoing", sender: "Jake", text: "that sounds dramatic" } },
        { kind: "add-fake-text-message", message: { side: "incoming", sender: "Jessica", text: "it has your name on it" } },
        { kind: "add-fake-text-message", message: { side: "outgoing", sender: "Jake", text: "okay... how much did you see?" } },
        { kind: "add-fake-text-message", message: { side: "incoming", sender: "Jessica", text: "enough. call me. now." } },
      ],
    });

    assert.equal(fakeTextBlocks(result.project.editorState).length, 7);
    console.log(JSON.stringify({
      created: true,
      projectId: result.project.id,
      name: result.project.name,
      background: background.name,
      messages: 7,
      url: `/projects/${result.project.id}`,
    }, null, 2));
  }
} finally {
  db().close();
}
