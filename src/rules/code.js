import {
  textblockTypeInputRule,
  wrappingInputRule,
  inputRules,
} from 'prosemirror-inputrules';
import { safeInsert } from 'prosemirror-utils';
import { leafNodeReplacementCharacter } from '../utils';
import { createInputRule, defaultInputRuleHandler } from '../utils';
import {
  isConvertableToCodeBlock,
  transformToCodeBlockAction,
  insertBlock,
} from '../commands';

export function blockQuoteRule(nodeType) {
  return wrappingInputRule(/^\s*>\s$/, nodeType);
}

export function codeBlockRule(nodeType) {
  return textblockTypeInputRule(/^```$/, nodeType);
}

/**
 * Get all block quote input rules
 *
 * @param {Schema} schema
 * @returns {}
 */
function getBlockQuoteRules(schema) {
  // '> ' for blockquote
  const greatherThanRule = defaultInputRuleHandler(
    blockQuoteRule(schema.nodes.blockquote),
    true
  );

  const leftNodeReplacementGreatherRule = createInputRule(
    new RegExp(`${leafNodeReplacementCharacter}\\s*>\\s$`),
    (state, _match, start, end) => {
      return insertBlock(
        state,
        schema.nodes.blockquote,
        'blockquote',
        start,
        end
      );
    },
    true
  );

  return [greatherThanRule, leftNodeReplacementGreatherRule];
}

/**
 * Get all code block input rules
 *
 * @param {Schema} schema
 * @returns {}
 */
function getCodeBlockRules(schema) {
  const threeTildeRule = createInputRule(
    /((^`{3,})|(\s`{3,}))(\S*)$/,
    (state, match, start, end) => {
      const attributes = {};
      if (match[4]) {
        attributes.language = match[4];
      }
      const newStart = match[0][0] === ' ' ? start + 1 : start;
      if (isConvertableToCodeBlock(state)) {
        const tr = transformToCodeBlockAction(state, attributes)
          // remove markdown decorator ```
          .delete(newStart, end)
          .scrollIntoView();
        return tr;
      }
      let { tr } = state;
      tr = tr.delete(newStart, end);
      const codeBlock = state.schema.nodes.code_block.createChecked();
      return safeInsert(codeBlock)(tr);
    },
    true
  );

  const leftNodeReplacementThreeTildeRule = createInputRule(
    new RegExp(`((${leafNodeReplacementCharacter}\`{3,})|(\\s\`{3,}))(\\S*)$`),
    (state, match, start, end) => {
      const attributes = {};
      if (match[4]) {
        attributes.language = match[4];
      }
      let tr = insertBlock(
        state,
        schema.nodes.code_block,
        'codeblock',
        start,
        end,
        attributes
      );
      return tr;
    },
    true
  );

  return [threeTildeRule, leftNodeReplacementThreeTildeRule];
}

export function codeInputRule(schema) {
  const rules = [];

  if (schema.nodes.blockquote) {
    rules.push(...getBlockQuoteRules(schema));
  }

  if (schema.nodes.code_block) {
    rules.push(...getCodeBlockRules(schema));
  }

  if (rules.length !== 0) {
    return inputRules({ rules });
  }
  return false;
}

export default codeInputRule;
