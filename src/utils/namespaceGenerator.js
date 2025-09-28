/**
 * Random Namespace Generator
 * Generates unique namespace names in the format:
 * {greek_mythology}-{verb}-{adjective}-{space_object}
 * Example: "apollo-forge-stellar-nebula"
 */

const logger = require('./logger');

class NamespaceGenerator {
  constructor() {
    // Greek mythology characters
    this.greekMythology = [
      'zeus', 'apollo', 'athena', 'artemis', 'hermes', 'poseidon', 'hades',
      'hera', 'demeter', 'dionysus', 'ares', 'hephaestus', 'aphrodite',
      'perseus', 'theseus', 'odysseus', 'achilles', 'hercules', 'orpheus',
      'atlas', 'prometheus', 'titan', 'kronos', 'rhea', 'helios', 'selene',
      'eos', 'nike', 'hecate', 'persephone', 'pandora', 'medusa', 'pegasus',
      'cerberus', 'hydra', 'phoenix', 'griffin', 'centaur', 'minotaur',
      'siren', 'cyclops', 'argus', 'icarus', 'daedalus', 'midas', 'tantalus'
    ];

    // Action verbs
    this.verbs = [
      'forge', 'spark', 'weave', 'craft', 'build', 'launch', 'ignite',
      'channel', 'summon', 'invoke', 'manifest', 'create', 'shape', 'mold',
      'cast', 'bind', 'fuse', 'merge', 'blend', 'sync', 'link', 'unite',
      'propel', 'accelerate', 'amplify', 'boost', 'charge', 'power', 'fuel',
      'navigate', 'pilot', 'steer', 'guide', 'direct', 'chart', 'map',
      'scan', 'probe', 'explore', 'discover', 'unveil', 'reveal', 'unlock'
    ];

    // Descriptive adjectives
    this.adjectives = [
      'stellar', 'cosmic', 'quantum', 'nebular', 'astral', 'celestial',
      'ethereal', 'radiant', 'luminous', 'brilliant', 'prismatic', 'spectral',
      'infinite', 'eternal', 'timeless', 'boundless', 'limitless', 'vast',
      'prime', 'apex', 'zenith', 'supreme', 'ultimate', 'absolute',
      'swift', 'rapid', 'instant', 'lightning', 'blazing', 'turbo',
      'crystal', 'diamond', 'titanium', 'platinum', 'golden', 'silver',
      'alpha', 'omega', 'delta', 'gamma', 'sigma', 'beta', 'nova'
    ];

    // Space objects
    this.spaceObjects = [
      'nebula', 'galaxy', 'cosmos', 'constellation', 'star', 'nova',
      'supernova', 'quasar', 'pulsar', 'comet', 'asteroid', 'meteor',
      'planet', 'moon', 'satellite', 'orbit', 'eclipse', 'aurora',
      'horizon', 'zenith', 'void', 'vortex', 'wormhole', 'singularity',
      'cluster', 'system', 'belt', 'ring', 'field', 'sphere', 'core',
      'photon', 'neutron', 'electron', 'proton', 'particle', 'wave',
      'beam', 'ray', 'pulse', 'flux', 'stream', 'cascade', 'matrix'
    ];
  }

  /**
   * Get a random element from an array
   */
  getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Generate a random namespace name
   * @returns {string} Random namespace in format: greekmyth-verb-adj-spaceobj
   */
  generate() {
    const parts = [
      this.getRandomElement(this.greekMythology),
      this.getRandomElement(this.verbs),
      this.getRandomElement(this.adjectives),
      this.getRandomElement(this.spaceObjects)
    ];

    const namespace = parts.join('-');
    logger.info(`[NamespaceGenerator] Generated namespace: ${namespace}`);
    return namespace;
  }

  /**
   * Generate a unique namespace by checking against existing ones
   * @param {Array} existingNamespaces - Array of existing namespace names
   * @param {number} maxAttempts - Maximum attempts to generate unique name
   * @returns {string} Unique namespace name
   */
  generateUnique(existingNamespaces = [], maxAttempts = 100) {
    const existingSet = new Set(existingNamespaces);

    for (let i = 0; i < maxAttempts; i++) {
      const namespace = this.generate();
      if (!existingSet.has(namespace)) {
        return namespace;
      }
    }

    // Fallback: add timestamp to ensure uniqueness
    const fallback = `${this.generate()}-${Date.now()}`;
    logger.warn(`[NamespaceGenerator] Using timestamp fallback: ${fallback}`);
    return fallback;
  }

  /**
   * Generate multiple unique namespaces
   * @param {number} count - Number of namespaces to generate
   * @returns {Array} Array of unique namespace names
   */
  generateMultiple(count = 5) {
    const namespaces = new Set();

    while (namespaces.size < count) {
      namespaces.add(this.generate());
    }

    return Array.from(namespaces);
  }

  /**
   * Convert namespace to table name format
   * @param {string} namespace - Namespace name with hyphens
   * @returns {string} Table name with underscores
   */
  toTableName(namespace) {
    return `${namespace.replace(/-/g, '_')}_user_source`;
  }

  /**
   * Generate a complete namespace configuration
   * @param {Array} keywords - Optional keywords for the namespace
   * @returns {Object} Complete namespace configuration
   */
  generateNamespaceConfig(keywords = ['default']) {
    const namespace = this.generate();
    const tableName = this.toTableName(namespace);

    return {
      name: namespace,
      keywords: keywords,
      table_name: tableName,
      description: `Auto-generated namespace: ${namespace}`,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get a sample of possible combinations
   * @param {number} sampleSize - Number of samples to generate
   * @returns {Array} Array of sample namespace names
   */
  getSamples(sampleSize = 10) {
    const samples = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(this.generate());
    }
    return samples;
  }

  /**
   * Calculate total possible combinations
   * @returns {number} Total possible unique combinations
   */
  getTotalCombinations() {
    return (
      this.greekMythology.length *
      this.verbs.length *
      this.adjectives.length *
      this.spaceObjects.length
    );
  }
}

// Singleton instance
const namespaceGenerator = new NamespaceGenerator();

module.exports = namespaceGenerator;