import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function readStyleBlock(source: string, name: string, nextName: string): string {
  return new RegExp(
    `${name}:\\s*\\{([\\s\\S]*?)\\n  \\},\\n  ${nextName}:`,
  ).exec(source)?.[1] || "";
}

function normalizeStyleBlock(block: string): string {
  return block.replace(/[\s,]/g, "");
}

describe("authenticated screen header consistency", () => {
  it("keeps Assigned Routes aligned with the Convoy and Calendar header", () => {
    const routeHeader = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListHeader.tsx"),
      "utf8",
    );
    const routeStyles = readFileSync(
      join(process.cwd(), "src/features/routes/RouteListScreen.styles.ts"),
      "utf8",
    );
    const operationsStyles = readFileSync(
      join(process.cwd(), "src/features/operations/OperationsScreen.styles.ts"),
      "utf8",
    );

    const matchingBlocks = [
      ["header", "headerTitleRow", "headerTopRow"],
      ["headerTitleRow", "headerCopy", "headerCopy"],
      ["headerCopy", "title", "eyebrow"],
      ["title", "subtitle", "subtitle"],
      ["subtitle", "headerActions", "headerActions"],
      ["headerActions", "signOutButton", "mapButton"],
      ["signOutButton", "signOutButtonPressed", "signOutButtonPressed"],
      ["signOutButtonPressed", "signOutButtonText", "signOutButtonText"],
      ["signOutButtonText", "noticeBox", "noticeBox"],
    ] as const;

    for (const [routeName, routeNextName, operationsNextName] of matchingBlocks) {
      const routeBlock = readStyleBlock(routeStyles, routeName, routeNextName);
      const operationsBlock = readStyleBlock(
        operationsStyles,
        routeName === "headerTitleRow" ? "headerTopRow" : routeName,
        operationsNextName,
      );
      assert.equal(
        normalizeStyleBlock(routeBlock),
        normalizeStyleBlock(operationsBlock),
        `${routeName} styles must match`,
      );
    }

    assert.match(routeHeader, /styles\.headerCopy/);
    assert.match(routeHeader, /styles\.headerActions/);
    assert.match(routeHeader, /<Text numberOfLines=\{1\} style=\{styles\.title\}>/);
    assert.match(routeHeader, /<Text numberOfLines=\{1\} style=\{styles\.subtitle\}>/);
  });
});
