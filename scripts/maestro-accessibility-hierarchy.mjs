export function parseCompactMaestroHierarchy(value) {
  const lines = String(value || '')
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines[0] !== 'element_num,depth,attributes,parent_num') {
    throw new Error('Maestro accessibility hierarchy header was invalid.');
  }
  return lines.slice(1).map((line) => {
    const columns = parseCsvLine(line);
    if (columns.length < 3 || columns.length > 4) {
      throw new Error('Maestro accessibility hierarchy row was invalid.');
    }
    const elementNumber = Number.parseInt(columns[0], 10);
    const depth = Number.parseInt(columns[1], 10);
    const parentNumber = columns[3] === undefined || columns[3] === ''
      ? null
      : Number.parseInt(columns[3], 10);
    if (
      !Number.isInteger(elementNumber) ||
      !Number.isInteger(depth) ||
      (parentNumber !== null && !Number.isInteger(parentNumber))
    ) {
      throw new Error('Maestro accessibility hierarchy indices were invalid.');
    }
    return {
      attributes: parseAttributes(columns[2]),
      depth,
      elementNumber,
      parentNumber,
      raw: line,
    };
  });
}

export function assertAccessibilityHierarchyElements(value, expectations) {
  const elements = parseCompactMaestroHierarchy(value);
  let previousElementNumber = -1;
  return expectations.map(({ enabled, id, label, labelStartsWith }) => {
    const matches = elements.filter((element) =>
      (element.attributes.get('resource-id') || []).includes(id)
    );
    if (matches.length !== 1) {
      throw new Error(
        `Accessibility hierarchy expected one exact ${id} row but found ${matches.length}.`,
      );
    }
    const element = matches[0];
    if (
      label !== undefined &&
      !(element.attributes.get('accessibilityText') || []).includes(label)
    ) {
      throw new Error(
        `Accessibility hierarchy ${id} row did not contain its exact label.`,
      );
    }
    if (
      labelStartsWith !== undefined &&
      !(element.attributes.get('accessibilityText') || []).some(
        (value) => value.startsWith(labelStartsWith),
      )
    ) {
      throw new Error(
        `Accessibility hierarchy ${id} row did not start with its expected label.`,
      );
    }
    const enabledValues = element.attributes.get('enabled') || [];
    if (enabled === true && !enabledValues.includes('true')) {
      throw new Error(`Accessibility hierarchy ${id} was not enabled.`);
    }
    // Maestro compact CSV omits false-valued attributes. The companion Maestro
    // flow proves enabled:false behavior; this retained hierarchy must at least
    // prove that XCTest did not expose the action as enabled.
    if (enabled === false && enabledValues.includes('true')) {
      throw new Error(`Accessibility hierarchy ${id} was unexpectedly enabled.`);
    }
    if (element.elementNumber <= previousElementNumber) {
      throw new Error(
        `Accessibility hierarchy ${id} was outside the expected traversal order.`,
      );
    }
    previousElementNumber = element.elementNumber;
    return element;
  });
}

function parseAttributes(value) {
  const attributes = new Map();
  String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        return;
      }
      const key = part.slice(0, separator).trim();
      const attributeValue = part.slice(separator + 1).trim();
      const values = attributes.get(key) || [];
      values.push(attributeValue);
      attributes.set(key, values);
    });
  return attributes;
}

function parseCsvLine(line) {
  const columns = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === ',' && !quoted) {
      columns.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (quoted) {
    throw new Error('Maestro accessibility hierarchy CSV quoting was invalid.');
  }
  columns.push(current);
  return columns;
}
