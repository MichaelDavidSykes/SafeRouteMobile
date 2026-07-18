import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

const HEADER = "element_num,depth,attributes,parent_num";

describe("Maestro accessibility hierarchy evidence", () => {
  it("parses exact identifiers, labels, state, commas, and traversal order", async () => {
    const { assertAccessibilityHierarchyElements } = await import(
      pathToFileURL(
        `${process.cwd()}/scripts/maestro-accessibility-hierarchy.mjs`,
      ).href
    ) as {
      assertAccessibilityHierarchyElements: (
        value: string,
        expectations: Array<{
          enabled?: boolean;
          id: string;
          label?: string;
          labelStartsWith?: string;
        }>,
      ) => unknown[];
    };
    const hierarchy = [
      HEADER,
      '0,0,"bounds=[0,0][393,852]",',
      '4,4,"accessibilityText=Guidance paused, route held; resource-id=status; enabled=true",3',
      '5,4,"accessibilityText=Reconnect before retrying workspace access; resource-id=retry",3',
      '6,4,"accessibilityText=End suspended route; resource-id=end; enabled=true; enabled=true",3',
      '7,4,"accessibilityText=Cold restart verification v1. Ready route. Guidance Operations operation. From London to Bristol. 2 hr. Updated today.; resource-id=card; enabled=true",3',
    ].join("\n");

    assert.equal(
      assertAccessibilityHierarchyElements(hierarchy, [
        {
          enabled: true,
          id: "status",
          label: "Guidance paused, route held",
        },
        {
          enabled: false,
          id: "retry",
          label: "Reconnect before retrying workspace access",
        },
        {
          enabled: true,
          id: "end",
          label: "End suspended route",
        },
        {
          enabled: true,
          id: "card",
          labelStartsWith: "Cold restart verification v1. ",
        },
      ]).length,
      4,
    );
  });

  it("rejects missing headers, duplicate IDs, wrong labels, states, and order", async () => {
    const { assertAccessibilityHierarchyElements } = await import(
      pathToFileURL(
        `${process.cwd()}/scripts/maestro-accessibility-hierarchy.mjs`,
      ).href
    ) as {
      assertAccessibilityHierarchyElements: (
        value: string,
        expectations: Array<{
          enabled?: boolean;
          id: string;
          label?: string;
          labelStartsWith?: string;
        }>,
      ) => unknown[];
    };
    const row = (
      element: number,
      id: string,
      label: string,
      enabled = "enabled=true",
    ) => `${element},2,"accessibilityText=${label}; resource-id=${id}; ${enabled}",1`;

    assert.throws(
      () => assertAccessibilityHierarchyElements(row(1, "status", "Status"), []),
      /header was invalid/,
    );
    assert.throws(
      () => assertAccessibilityHierarchyElements(
        [HEADER, row(1, "status", "Status"), row(2, "status", "Status")].join("\n"),
        [{ id: "status", label: "Status" }],
      ),
      /found 2/,
    );
    assert.throws(
      () => assertAccessibilityHierarchyElements(
        [HEADER, row(1, "status", "Wrong")].join("\n"),
        [{ id: "status", label: "Status" }],
      ),
      /exact label/,
    );
    assert.throws(
      () => assertAccessibilityHierarchyElements(
        [HEADER, row(1, "retry", "Retry")].join("\n"),
        [{ enabled: false, id: "retry", label: "Retry" }],
      ),
      /unexpectedly enabled/,
    );
    assert.throws(
      () => assertAccessibilityHierarchyElements(
        [HEADER, row(1, "card", "Another route, Ready route")].join("\n"),
        [{ id: "card", labelStartsWith: "Cold restart verification v1. " }],
      ),
      /expected label/,
    );
    assert.throws(
      () => assertAccessibilityHierarchyElements(
        [HEADER, row(2, "end", "End"), row(3, "status", "Status")].join("\n"),
        [
          { id: "status", label: "Status" },
          { id: "end", label: "End" },
        ],
      ),
      /traversal order/,
    );
  });
});
