import { textblockTypeInputRule, inputRules } from 'prosemirror-inputrules';

import { leafNodeReplacementCharacter } from '../utils';
import { createInputRule, defaultInputRuleHandler } from '../utils';
import { insertBlock } from '../commands';

const MAX_HEADING_LEVEL = 5;

function getHeadingLevel(match) {
  return {
    level: match[1].length,
  };
}

export function headingRule(nodeType, maxLevel) {
  return textblockTypeInputRule(
    new RegExp('^(#{1,' + maxLevel + '})\\s$'),
    nodeType,
    getHeadingLevel
  );
}

/**
 * Get heading rules
 *
 * @param {Schema} schema
 * @returns {}
 */
function getHeadingRules(schema) {
  // '# ' for h1, '## ' for h2 and etc
  const hashRule = defaultInputRuleHandler(
    headingRule(schema.nodes.heading, MAX_HEADING_LEVEL),
    true
  );

  const leftNodeReplacementHashRule = createInputRule(
    new RegExp(`${leafNodeReplacementCharacter}(#{1,6})\\s$`),
    (state, match, start, end) => {
      const level = match[1].length;
      return insertBlock(
        state,
        schema.nodes.heading,
        `heading${level}`,
        start,
        end,
        { level }
      );
    },
    true
  );

  return [hashRule, leftNodeReplacementHashRule];
}

export function blocksInputRule(schema) {
  const rules = [];

  if (schema.nodes.heading) {
    rules.push(...getHeadingRules(schema));
  }

  if (rules.length !== 0) {
    return inputRules({ rules });
  }
  return false;
}

export default blocksInputRule;
