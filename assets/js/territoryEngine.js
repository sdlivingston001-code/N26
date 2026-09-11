/**
 * territoryEngine.js — Business logic for territory income, recruitment & rules.
 *
 * Orchestrates the full territory-resolution pipeline:
 *   1. Apply schema defaults + gang overrides  (via TerritorySchemas)
 *   2. Roll dice / draw cards for income
 *   3. Roll for random recruits
 *   4. Collect fixed recruits, gear, reputation, and special rules
 *   5. Detect & report triggered events (duplicate rolls, joker draws, etc.)
 *
 * All DOM-free — rendering lives in territoryUI.js.
 *
 * Depends on: dice.js (Dice), territorySchemas.js (TerritorySchemas)
 */

import { Dice } from './dice.js';
import { TerritorySchemas } from './territorySchemas.js';

export const TerritoryEngine = {
  /**
   * Resolve a territory through the schema layer.
   * Applies schema defaults and gang-specific modifiers.
   * Falls back to the raw territory if TerritorySchemas isn't loaded.
   * @param {Object} territory
   * @param {string|null} selectedGang
   * @returns {Object}
   */
  resolveWithSchema(territory, selectedGang) {
    return TerritorySchemas.resolveTerritory(territory, selectedGang);
  },

  /**
   * Get a gang-specific property override, falling back to the base property.
   * NOTE: Primarily handled by schema resolution now; kept for backward compat.
   * @param {Object} territory
   * @param {string} propertyName
   * @param {string|null} selectedGang
   * @returns {*}
   */
  getPropertyWithGangOverride(territory, propertyName, selectedGang) {
    if (selectedGang) {
      const gangKey = `${propertyName}_${selectedGang}`;
      if (territory[gangKey]) {
        return territory[gangKey];
      }
    }
    return territory[propertyName];
  },

  // Helper: Resolve a simple text-based rule (reputation, fixed gear, etc.)
  resolveSimpleRule(territory, propertyName, selectedGang) {
    const value = territory[propertyName];  // Schema layer already applied gang overrides
    return {
      description: value || null
    };
  },

  // Helper: Process a single rule type across all territories
  processRuleType(territories, propertyName, resolveFunction, selectedGang, userInputCounts = {}) {
    const results = [];
    const territoriesWithout = [];
    
    territories.forEach(territory => {
      const hasProperty = territory[propertyName] || 
        (selectedGang && territory[`${propertyName}_${selectedGang}`]);
      
      if (!hasProperty) {
        territoriesWithout.push(territory.name || territory.id);
      }
      
      const result = resolveFunction.call(this, territory, selectedGang, userInputCounts[territory.id], territories);
      results.push({ id: territory.id, result });
    });
    
    return { results, territoriesWithout };
  },
  // Event trigger test functions
  eventTriggers: {
    hasDuplicates: (rolls) => Dice.hasDuplicates(rolls),
    isJoker: (card) => card && card.rank === 'Joker',
    // Add more trigger functions as needed
    // allSameValue: (rolls) => rolls.every(r => r === rolls[0]),
    // containsValue: (rolls, value) => rolls.includes(value),
  },

  /**
   * Master resolver — processes all territories and all rule types in one call.
   *
   * @param {Object[]} territories     - Raw territory objects from data.
   * @param {Object}   [userInputCounts={}] - Per-territory user inputs (dice count or suit guess).
   * @param {string|null} [selectedGang=null] - Selected gang ID for overrides.
   * @returns {{ territories: Object[], territoriesWithEvents: Object[], territoriesWithout*: string[] }}
   */
  resolve_all(territories, userInputCounts = {}, selectedGang = null) {
    if (!Array.isArray(territories)) return [];

    // Resolve all territories with schema before processing
    const resolvedTerritories = territories.map(territory => 
      this.resolveWithSchema(territory, selectedGang)
    );

    const territoriesWithEvents = [];
    const ruleTypes = [
      { name: 'income', property: 'income', resolver: this.resolve_income },
      { name: 'recruit', property: 'random_recruit', resolver: this.resolve_randomrecruit },
      { name: 'fixedRecruit', property: 'fixed_recruit', resolver: this.resolve_fixedrecruit },
      { name: 'reputation', property: 'reputation', resolver: this.resolve_reputation },
      { name: 'fixedGear', property: 'fixed_gear', resolver: this.resolve_fixedgear },
      { name: 'battleSpecialRules', property: 'battle_special_rules', resolver: this.resolve_battlespecialrules },
      { name: 'tradingSpecialRules', property: 'trading_special_rules', resolver: this.resolve_tradingspecialrules },
      { name: 'scenarioSelectionSpecialRules', property: 'scenario_selection_special_rules', resolver: this.resolve_scenarioselectionspecialrules }
    ];

    // Process all rule types
    const processedRules = {};
    ruleTypes.forEach(({ name, property, resolver }) => {
      const { results, territoriesWithout } = this.processRuleType(
        resolvedTerritories, property, resolver, selectedGang, userInputCounts
      );
      processedRules[name] = { results, territoriesWithout };
      
      // Collect events from income results
      if (name === 'income') {
        results.forEach((item, index) => {
          if (item.result.eventTriggered) {
            territoriesWithEvents.push({
              id: resolvedTerritories[index].id,
              name: resolvedTerritories[index].name || resolvedTerritories[index].id,
              description: item.result.eventText || item.result.description
            });
          }
        });
      }
    });

    // Combine all results by territory
    return {
      territories: resolvedTerritories.map((territory, index) => ({
        id: territory.id,
        territory,
        ...Object.fromEntries(
          ruleTypes.map(({ name }) => [name, processedRules[name].results[index].result])
        )
      })),
      ...Object.fromEntries(
        ruleTypes.map(({ name, property }) => [
          `territoriesWithout${name.charAt(0).toUpperCase() + name.slice(1)}`,
          processedRules[name].territoriesWithout
        ])
      ),
      territoriesWithEvents
    };
  },

  /**
   * Resolve income for a single territory.
   *
   * Handles three income variants:
   * - Dice-based (standard):  roll XdY, multiply, add.
   * - Deck-based (Gambling Den):  draw a card, compare guessed suit.
   * - User-defined count:  player chooses how many dice to roll.
   *
   * Also checks for conditional parameters (bonus when another territory is held)
   * and event triggers (duplicate rolls, joker draws).
   *
   * @param {Object}   territory       - Resolved territory object.
   * @param {string|null} selectedGang
   * @param {number|string|null} userInput - Dice count (number) or guessed suit (string).
   * @param {Object[]} [allTerritories=[]] - All selected territories (for conditional checks).
   * @returns {Object} Income result with rolls, credits, description, event info.
   */
  resolve_income(territory, selectedGang, userInput, allTerritories = []) {
    const income = territory.income;  // Schema layer already applied gang overrides
    
    if (!income) {
      return { roll: null, credits: 0, description: null };
    }

    // Handle deck-based income (gambling den)
    if (income.draw_from_deck) {
      return this.resolve_deckIncome(income, userInput);
    }

    // Check for conditional parameters based on other territories
    let multiplier = income.multiplier;
    let sides = income.sides;
    let count = income.count;
    let addition = income.addition;
    
    if (income.required_territory) {
      const hasDependency = allTerritories.some(t => t.id === income.required_territory);
      if (hasDependency) {
        // Apply conditional overrides if the required territory is present
        if (income.conditional_multiplier !== undefined) multiplier = income.conditional_multiplier;
        if (income.conditional_sides !== undefined) sides = income.conditional_sides;
        if (income.conditional_count !== undefined) count = income.conditional_count;
        if (income.conditional_addition !== undefined) addition = income.conditional_addition;
      }
    }

    // Handle user-defined count parameters
    const { count_min, count_max, count_multiplier = 1 } = income;
    
    // userInput is the count for dice-based income
    const userCount = userInput;
    
    // Determine dice count (user input overrides conditional overrides)
    if (count_min !== undefined && count_max !== undefined) {
      count = userCount;
    }
    const countDescription = (count_min !== undefined && count_max !== undefined)
      ? (count_multiplier > 1 ? ` (user selected ${userCount / count_multiplier}, x${count_multiplier} = ${count})` : ` (user selected ${count})`)
      : '';

    // Roll dice
    const rolls = Dice.rollMany(count, null, sides);
    const total = rolls.reduce((sum, roll) => sum + roll, 0);
    
    // Check for events and apply overrides
    const eventTriggered = income.event?.trigger && 
      this.eventTriggers[income.event.trigger] && 
      this.eventTriggers[income.event.trigger](rolls);
    const effectiveMultiplier = eventTriggered && income.event.multiplier !== undefined
      ? income.event.multiplier
      : multiplier;
    const effectiveAddition = eventTriggered && income.event.addition !== undefined
      ? income.event.addition
      : addition;
    
    const credits = total * effectiveMultiplier + effectiveAddition;

    // Build description
    const sortedRolls = [...rolls].sort((a, b) => a - b);
    const calculationPart = this.formatCalculation(effectiveMultiplier, total, effectiveAddition);
    const description = `Rolled ${count}d${sides}${countDescription}: ${sortedRolls.join('+')} = ${total}. Income: ${calculationPart} = ${credits} credits.`;
    
    return {
      rolls,
      total,
      multiplier: effectiveMultiplier,
      addition: effectiveAddition,
      credits,
      description,
      eventTriggered,
      eventTrigger: eventTriggered ? income.event.trigger : null,
      eventText: eventTriggered && income.event.text ? income.event.text : null
    };
  },

  /**
   * Build a human-readable calculation string like "(4 × 10) + 5".
   * @param {number} multiplier
   * @param {number} total - Sum of dice.
   * @param {number} addition
   * @returns {string}
   */
  formatCalculation(multiplier, total, addition) {
    if (multiplier !== 1 && addition !== 0) {
      return `(${total} × ${multiplier}) + ${addition}`;
    } else if (multiplier !== 1) {
      return `${total} × ${multiplier}`;
    } else if (addition !== 0) {
      return `${total} + ${addition}`;
    }
    return `${total}`;
  },

  /**
   * Resolve deck-based income (Gambling Den).
   * Draws a card, compares suit / colour to the player's guess,
   * and calculates credits as card-value × multiplier.
   * @param {Object} income      - Resolved income config.
   * @param {string} guessedSuit - One of ♠ ♥ ♦ ♣.
   * @returns {Object} Card draw result with credits and description.
   */
  resolve_deckIncome(income, guessedSuit) {
    const card = Dice.drawCards(1)[0];
    const suitColors = {
      '♠': 'black', '♣': 'black',
      '♥': 'red', '♦': 'red'
    };
    
    const cardColor = suitColors[card.suit];
    const guessedColor = suitColors[guessedSuit];
    const guessedSuitColored = `<span style="color: ${guessedColor};">${guessedSuit}</span>`;
    
    // Check for events (e.g., drawing a joker)
    const eventTriggered = income.event?.trigger && 
      this.eventTriggers[income.event.trigger] && 
      this.eventTriggers[income.event.trigger](card);
    
    let multiplier = 0;
    let outcome = '';
    
    if (card.suit === guessedSuit) {
      multiplier = 10;
      outcome = '✓ Correct suit!';
    } else if (cardColor === guessedColor) {
      multiplier = 5;
      outcome = '~ Correct color, but wrong suit.';
    } else {
      multiplier = 0;
      outcome = '✗ Bad guess!';
    }
    
    // Apply event overrides if triggered
    const effectiveMultiplier = eventTriggered && income.event.multiplier !== undefined
      ? income.event.multiplier
      : multiplier;
    
    const credits = card.value * effectiveMultiplier;
    const description = `Drew ${card.display}. Guessed ${guessedSuitColored}. ${outcome} Income: ${card.value} × ${effectiveMultiplier} = ${credits} credits.`;
    
    return {
      card: card.display,
      cardValue: card.value,
      guessedSuit,
      outcome,
      multiplier: effectiveMultiplier,
      credits,
      description,
      eventTriggered,
      eventTrigger: eventTriggered ? income.event.trigger : null,
      eventText: eventTriggered && income.event.text ? income.event.text : null
    };
  },

  /**
   * Resolve random recruitment for a territory.
   * Rolls XdY, counts how many match the target value, and looks up
   * the corresponding outcome text.
   * @param {Object} territory
   * @param {string|null} selectedGang
   * @returns {Object} Recruitment result with rolls, match count, outcome.
   */
  resolve_randomrecruit(territory, selectedGang) {
    const recruit = territory.random_recruit;  // Schema layer already applied gang overrides
    
    if (!recruit) {
      return { rolls: null, count: 0, description: null };
    }

    try {
      // Schema layer provides all defaults, just destructure
      const { count, sides, target, outcomes, effect } = recruit;

      const rolls = Dice.rollMany(count, null, sides);
      const sortedRolls = [...rolls].sort((a, b) => a - b);
      const matchCount = Dice.countValue(rolls, target);
      const outcome = outcomes[matchCount.toString()] || "No result defined for this roll.";

      let description = `Rolled ${count}d${sides}: ${sortedRolls.join(', ')}. ${matchCount} matching ${target}(s). ${outcome}`;
      if (effect) {
        description += ` ${effect}`;
      }

      return { rolls, target, matchCount, outcome, description };
    } catch (error) {
      console.error("Error in resolveRecruit:", error);
      return {
        rolls: null,
        count: 0,
        description: `Error processing recruitment: ${error.message}`
      };
    }
  },

  // Simple text-based rules (all follow the same pattern)
  resolve_fixedrecruit(territory, selectedGang) {
    return this.resolveSimpleRule(territory, 'fixed_recruit', selectedGang);
  },

  resolve_reputation(territory, selectedGang) {
    return this.resolveSimpleRule(territory, 'reputation', selectedGang);
  },

  resolve_fixedgear(territory, selectedGang) {
    return this.resolveSimpleRule(territory, 'fixed_gear', selectedGang);
  },

  resolve_battlespecialrules(territory, selectedGang) {
    return this.resolveSimpleRule(territory, 'battle_special_rules', selectedGang);
  },

  resolve_tradingspecialrules(territory, selectedGang) {
    return this.resolveSimpleRule(territory, 'trading_special_rules', selectedGang);
  },

  resolve_scenarioselectionspecialrules(territory, selectedGang) {
    return this.resolveSimpleRule(territory, 'scenario_selection_special_rules', selectedGang);
  }
};
