/**
 * territorySchemas.js — Schema system for territory income & recruitment rules.
 *
 * Territories in territories.yml declare their income/recruit behaviour by
 * referencing a named schema (e.g. `schema: withDuplicateEvent`).  At
 * resolve-time this module performs a **three-way property merge**:
 *
 *     baseDefaults  →  schema defaults  →  territory-level overrides
 *
 * This means a territory only needs to specify what differs from its schema
 * (and schemas only specify what differs from the base).
 *
 * Gang-specific overrides
 * -----------------------
 * Any territory property can be overridden per-gang by appending `_<gangId>`
 * to the YAML key.  For example `income_cawdor` overrides `income` when
 * Cawdor is the selected gang.  The `resolveTerritory` method handles this
 * suffix pattern automatically.
 *
 * Available income schemas:
 *   standard           – plain XdY × multiplier + addition
 *   withDuplicateEvent – rolls ≥ 2 dice; triggers an event on duplicate values
 *   userDefinedNumber  – player chooses how many dice to roll
 *   deckBased          – draws a card instead of rolling dice (Gambling Den)
 *   conditional        – parameters change if another territory is also held
 *
 * Available recruit schemas:
 *   standard – roll Xd6, count successes on target value
 *
 * Depends on: (none — pure data logic)
 */

export const TerritorySchemas = {
  // ──── Base defaults ────
  // These are the fallback values when no schema or property override exists.
  baseDefaults: {
    income: {
      count: 1,
      sides: 6,
      multiplier: 10,
      addition: 0
    },
    recruit: {
      count: 2,
      sides: 6,
      target: 6,
      outcomes: {
        "0": "No new recruits.",
        "1": "Recruit a juve for free.",
        "2": "Recruit either two juves or one ganger for free."
      }
    }
  },

  // ──── Income schema types ────
  // Each schema only defines what differs from baseDefaults.income.
  incomeSchemas: {
    
    // Standard income: Uses all base defaults (1d6 x10 + )
    standard: {},
    
    // With disaster event on duplicates
    withDuplicateEvent: {
      count: 2, //By definition there must be at least 2 to allow for duplicates
      event: {
        trigger: "hasDuplicates"
      }
    },

    // User-defined count: Player chooses how many dice to roll
    userDefinedNumber: {
      count_min: 0,
      count_max: 100
    },
  
    // Deck-based income (gambling den)
    deckBased: {
      draw_from_deck: 1
    },

    // Conditional: Parameters change if another territory is selected
    // Territory must define: required_territory, conditional_count/multiplier/sides/addition
    conditional: {}
  },

  // Random recruit schema types
  recruitSchemas: {
    // Standard recruit: Uses all base defaults (2d6, target 6)
    standard: {}
  },

  // Helper: Get income schema by name
  getIncomeSchema(schemaName) {
    return this.incomeSchemas[schemaName] || {};
  },

  // Helper: Get recruit schema by name
  getRecruitSchema(schemaName) {
    return this.recruitSchemas[schemaName] || {};
  },

  /**
   * Main resolver: merge baseDefaults → schema → territory property.
   *
   * If the property object contains a `schema` key, the named schema's
   * defaults are merged between the base and the property.  Event objects
   * are deep-merged so schema-level and property-level event fields combine.
   *
   * @param {Object}  property    - The territory's income or recruit block.
   * @param {'income'|'recruit'} [schemaType='income']
   * @returns {Object|null} Fully-resolved property with all defaults filled in.
   */
  resolveProperty(property, schemaType = 'income') {
    if (!property) return null;
    
    // Get base defaults
    const baseDefaults = schemaType === 'income' 
      ? this.baseDefaults.income
      : this.baseDefaults.recruit;
    
    // If property has a schema reference, merge base defaults -> schema -> property
    if (property.schema) {
      const schemaDefaults = schemaType === 'income' 
        ? this.getIncomeSchema(property.schema)
        : this.getRecruitSchema(property.schema);
      
      // Three-way merge: base -> schema -> property overrides
      // Special handling for event object to do deep merge
      const merged = { ...baseDefaults, ...schemaDefaults, ...property };
      if (schemaDefaults.event || property.event) {
        merged.event = { 
          ...schemaDefaults.event, 
          ...property.event 
        };
      }
      return merged;
    }
    
    // Always merge base defaults, even without a schema reference
    return { ...baseDefaults, ...property };
  },

  /**
   * Resolve a complete territory object with gang-specific overrides.
   *
   * For each overridable property (income, random_recruit, reputation, etc.),
   * checks for a `property_<gangId>` key on the territory and substitutes it.
   * Income and recruit overrides also get full schema resolution.
   *
   * @param {Object}      territory - Raw territory from data YAML.
   * @param {string|null} [gangId=null] - Selected gang identifier.
   * @returns {Object} Shallow copy of territory with resolved properties.
   */
  resolveTerritory(territory, gangId = null) {
    let resolved = { ...territory };
    
    // Resolve income schema
    if (resolved.income) {
      resolved.income = this.resolveProperty(resolved.income, 'income');
    }
    
    // Resolve recruit schema
    if (resolved.random_recruit) {
      resolved.random_recruit = this.resolveProperty(resolved.random_recruit, 'recruit');
    }
    
    // Apply gang-specific property overrides using _gangId suffix pattern
    if (gangId) {
      const gangSuffix = `_${gangId}`;
      
      // Handle income override with schema resolution
      if (resolved[`income${gangSuffix}`]) {
        resolved.income = this.resolveProperty(resolved[`income${gangSuffix}`], 'income');
      }
      
      // Handle recruit override with schema resolution
      if (resolved[`random_recruit${gangSuffix}`]) {
        resolved.random_recruit = this.resolveProperty(resolved[`random_recruit${gangSuffix}`], 'recruit');
      }
      
      // Handle simple property overrides (no schema resolution needed)
      ['reputation', 'battle_special_rules', 'trading_special_rules', 'scenario_selection_special_rules', 'fixed_recruit', 'fixed_gear'].forEach(prop => {
        const gangProp = `${prop}${gangSuffix}`;
        if (resolved[gangProp]) {
          resolved[prop] = resolved[gangProp];
        }
      });
    }
    
    return resolved;
  },

  /**
   * Validate a single territory's schema references.
   * @param {Object} territory
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateTerritory(territory) {
    const errors = [];
    
    // Basic validation
    if (!territory.name) {
      errors.push(`Territory ${territory.id} missing name`);
    }
    
    if (!territory.level) {
      errors.push(`Territory ${territory.id} missing level`);
    }
    
    // Validate income schema if present
    if (territory.income && territory.income.schema) {
      if (!this.incomeSchemas[territory.income.schema]) {
        errors.push(`Territory ${territory.id} references unknown income schema: ${territory.income.schema}`);
      }
    }
    
    // Validate recruit schema if present
    if (territory.random_recruit && territory.random_recruit.schema) {
      if (!this.recruitSchemas[territory.random_recruit.schema]) {
        errors.push(`Territory ${territory.id} references unknown recruit schema: ${territory.random_recruit.schema}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Validate all territories and return aggregated errors.
   * @param {Object[]} territories
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateAll(territories) {
    const allErrors = [];
    
    territories.forEach(territory => {
      const { valid, errors } = this.validateTerritory(territory);
      if (!valid) {
        allErrors.push(...errors);
      }
    });
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
};
