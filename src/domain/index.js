const { createHash } = require("node:crypto");
const { ontology, deepFreeze } = require("./catalog");
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function jsonValue(value, path = "properties", seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value))) throw new Error(`${path} must contain finite JSON values`);
  if (seen.has(value)) throw new Error(`${path} must not contain cycles`);
  seen.add(value);
  for (const [k, v] of Object.entries(value)) jsonValue(v, `${path}.${k}`, seen);
  seen.delete(value);
}
function partialDate(value) {
  if (typeof value !== "string" || !/^\d{4}(-\d{2}){0,2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || (month !== undefined && (month < 1 || month > 12))) return false;
  if (day === undefined) return true;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function validateFields(definition, properties) {
  for (const [key, field] of Object.entries(definition.fields)) {
    const value = properties[key];
    const conditionRequired = field.requiredUnless && !Object.entries(field.requiredUnless).every(([k, v]) => properties[k] === v);
    const required = field.required || conditionRequired;
    if (value === undefined || value === null) {
      if (required) throw new Error(`${definition.key}.${key} is required`);
      continue;
    }
    let valid = true;
    switch (field.type) {
      case "string": valid = typeof value === "string" && (!required || nonempty(value)); break;
      case "mbid": valid = typeof value === "string" && MBID.test(value); break;
      case "positiveInteger": valid = Number.isSafeInteger(value) && value > 0; break;
      case "nonNegativeInteger": valid = Number.isSafeInteger(value) && value >= 0; break;
      case "finite": valid = typeof value === "number" && Number.isFinite(value); break;
      case "partialDate": valid = partialDate(value); break;
      case "object": valid = !!value && typeof value === "object" && !Array.isArray(value); break;
      case "stringArray": valid = Array.isArray(value) && value.length > 0 && value.every(nonempty); break;
      case "distinctPair": valid = Array.isArray(value) && value.length === 2 && value.every(nonempty) && value[0] !== value[1]; break;
      case "mappingStatus": valid = ["candidate", "provider-matched", "verified", "rejected", "unresolved"].includes(value); break;
      case "scoreMeaning": valid = ["distance", "similarity"].includes(value); break;
      case "credits":
        valid = Array.isArray(value) && value.length > 0;
        if (valid) for (const credit of value) {
          for (const name of ["artistId", "creditedName", "joinPhrase"]) {
            if (!credit || typeof credit[name] !== "string" || (name !== "joinPhrase" && !nonempty(credit[name]))) throw new Error(`${definition.key}.${key}.${name} is required`);
          }
        }
        break;
      default: throw new Error(`Unsupported field type ${field.type}`);
    }
    if (!valid) throw new Error(`${definition.key}.${key} must be ${field.type}`);
  }
  jsonValue(properties);
}
class DomainEntity {
  static get definition() { return getTypeDefinition(this.type); }
  constructor({ id, name, externalId = null, properties = {} } = {}) {
    const definition = this.constructor.definition;
    if (!nonempty(name)) throw new Error(`${definition.key}.name is required`);
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new Error("properties must be an object");
    for (const key of ["id", "name", "labels", "type", "externalId", "ontologyVersion"]) if (Object.hasOwn(properties, key)) throw new Error(`Reserved property ${key}`);
    let identity = id;
    if (externalId === null && typeof id === "string" && /^\s*musicbrainz:/i.test(id)) throw new Error("MusicBrainz identity requires typed externalId");
    if (externalId !== null) {
      if (externalId.provider !== "musicbrainz" || !definition.providerType || externalId.type !== definition.providerType) throw new Error(`${definition.key}: external identity type mismatch`);
      if (typeof externalId.value !== "string" || !MBID.test(externalId.value)) throw new Error("Invalid MusicBrainz MBID");
      externalId = { provider: "musicbrainz", type: definition.providerType, value: externalId.value.toLowerCase() };
      identity = `musicbrainz:${externalId.type}:${externalId.value}`;
      if (id !== undefined && id !== identity) throw new Error("Explicit identity conflicts with provider identity");
    }
    if (!nonempty(identity) || identity !== identity.trim()) throw new Error(`${definition.key} requires an explicit identity without surrounding whitespace`);
    validateFields(definition, properties);
    this.id = identity;
    this.type = definition.key;
    this.name = name;
    this.externalId = externalId ? deepFreeze(externalId) : null;
    this.properties = deepFreeze(structuredClone(properties));
    Object.freeze(this);
  }
  toGraphNode() {
    return { id: this.id, labels: [this.type], properties: { ...structuredClone(this.properties), id: this.id, name: this.name, ...(this.externalId ? { externalId: { ...this.externalId } } : {}), ontologyVersion: ontology.version } };
  }
}
class Artist extends DomainEntity { static type = "Artist"; }
class Work extends DomainEntity { static type = "Work"; }
class Recording extends DomainEntity { static type = "Recording"; }
class ReleaseGroup extends DomainEntity { static type = "ReleaseGroup"; }
class Release extends DomainEntity { static type = "Release"; }
class Label extends DomainEntity { static type = "Label"; }
class Area extends DomainEntity { static type = "Area"; }
class Place extends DomainEntity { static type = "Place"; }
class Event extends DomainEntity { static type = "Event"; }
class Instrument extends DomainEntity { static type = "Instrument"; }
class Genre extends DomainEntity { static type = "Genre"; }
class Series extends DomainEntity { static type = "Series"; }
class Url extends DomainEntity { static type = "Url"; }
class Medium extends DomainEntity { static type = "Medium"; }
class Track extends DomainEntity { static type = "Track"; }
class ArtistCredit extends DomainEntity { static type = "ArtistCredit"; }
class ListeningEvent extends DomainEntity { static type = "ListeningEvent"; }
class IdentityMapping extends DomainEntity { static type = "IdentityMapping"; }
class AcousticAnalysis extends DomainEntity { static type = "AcousticAnalysis"; }
class SimilarityAssessment extends DomainEntity { static type = "SimilarityAssessment"; }
class MusicScene extends DomainEntity { static type = "MusicScene"; }
class Style extends DomainEntity { static type = "Style"; }
class RecordingSession extends DomainEntity { static type = "RecordingSession"; }
class Project extends DomainEntity { static type = "Project"; }
class Mix extends DomainEntity { static type = "Mix"; }
class Master extends DomainEntity { static type = "Master"; }
class Stem extends DomainEntity { static type = "Stem"; }
class Equipment extends DomainEntity { static type = "Equipment"; }
class Amplifier extends DomainEntity { static type = "Amplifier"; }
class EffectsPedal extends DomainEntity { static type = "EffectsPedal"; }
class Guitar extends DomainEntity { static type = "Guitar"; }
class Synthesizer extends DomainEntity { static type = "Synthesizer"; }
class Console extends DomainEntity { static type = "Console"; }
class SignalChain extends DomainEntity { static type = "SignalChain"; }
class Company extends DomainEntity { static type = "Company"; }
class Technique extends DomainEntity { static type = "Technique"; }
class Process extends DomainEntity { static type = "Process"; }
class Format extends DomainEntity { static type = "Format"; }
class Technology extends DomainEntity { static type = "Technology"; }
class SourceDocument extends DomainEntity { static type = "SourceDocument"; }
class EvidenceAssertion extends DomainEntity { static type = "EvidenceAssertion"; }
class PreferenceSignal extends DomainEntity { static type = "PreferenceSignal"; }
class DomainRelationship {
  static get definition() { return getTypeDefinition(this.type); }
  constructor({ source, target, assertionKey, properties = {} } = {}) {
    const definition = this.constructor.definition;
    if (!(source instanceof DomainEntity) || !definition.sourceTypes.includes(source.type)) throw new Error(`${definition.key}: invalid source endpoint`);
    if (!(target instanceof DomainEntity) || !definition.targetTypes.includes(target.type)) throw new Error(`${definition.key}: invalid target endpoint`);
    for (const [side, other, field] of [[source, target, definition.sourceReference], [target, source, definition.targetReference]]) {
      if (!field) continue;
      const value = side.properties[field];
      if (!(Array.isArray(value) ? value.includes(other.id) : value === other.id)) throw new Error(`${definition.key}: endpoint contradicts ${field} reference`);
    }
    if (!nonempty(assertionKey)) throw new Error("Relationship assertionKey is required");
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new Error("properties must be an object");
    for (const key of ["assertionKey", "ontologyVersion"]) if (Object.hasOwn(properties, key)) throw new Error(`Reserved property ${key}`);
    validateFields(definition, properties);
    if (definition.key === "CreditsArtist" && source.properties.credits[properties.position]?.artistId !== target.id) throw new Error("CreditsArtist: endpoint contradicts ordered credit position");
    if (definition.key === "MusicBrainzRelationship" && (properties.sourceType !== source.type || properties.targetType !== target.type)) throw new Error("MusicBrainzRelationship: endpoint type mismatch");
    if (definition.key === "RedirectsTo" && source.type !== target.type) throw new Error("RedirectsTo requires the same entity type");
    this.id = `relationship:${createHash("sha256").update(JSON.stringify([definition.key, source.id, target.id, assertionKey])).digest("hex")}`;
    this.type = definition.key;
    this.source = source.id;
    this.target = target.id;
    this.assertionKey = assertionKey;
    this.properties = deepFreeze(structuredClone(properties));
    Object.freeze(this);
  }
  toGraphRelationship() {
    return { id: this.id, source: this.source, target: this.target, type: this.type, properties: { ...structuredClone(this.properties), assertionKey: this.assertionKey, ontologyVersion: ontology.version } };
  }
}
class EditionOf extends DomainRelationship { static type = "EditionOf"; }
class ReleaseLabel extends DomainRelationship { static type = "ReleaseLabel"; }
class RedirectsTo extends DomainRelationship { static type = "RedirectsTo"; }
class CreditsArtist extends DomainRelationship { static type = "CreditsArtist"; }
class MusicBrainzRelationship extends DomainRelationship { static type = "MusicBrainzRelationship"; }
class HasMedium extends DomainRelationship { static type = "HasMedium"; }
class HasTrack extends DomainRelationship { static type = "HasTrack"; }
class UsesRecording extends DomainRelationship { static type = "UsesRecording"; }
class CreditedAs extends DomainRelationship { static type = "CreditedAs"; }
class PerformanceOf extends DomainRelationship { static type = "PerformanceOf"; }
class HasMapping extends DomainRelationship { static type = "HasMapping"; }
class MapsToRecording extends DomainRelationship { static type = "MapsToRecording"; }
class AnalysisOf extends DomainRelationship { static type = "AnalysisOf"; }
class ComparesRecording extends DomainRelationship { static type = "ComparesRecording"; }
class SupportedByAnalysis extends DomainRelationship { static type = "SupportedByAnalysis"; }
class AssertionSubject extends DomainRelationship { static type = "AssertionSubject"; }
class AssertionFactor extends DomainRelationship { static type = "AssertionFactor"; }
class SupportedBySource extends DomainRelationship { static type = "SupportedBySource"; }
class PreferenceFor extends DomainRelationship { static type = "PreferenceFor"; }
function getOntology() { return ontology; }
function getTypeDefinition(key) {
  const definition = Object.hasOwn(ontology.entities, key) ? ontology.entities[key] : Object.hasOwn(ontology.relationships, key) ? ontology.relationships[key] : null;
  if (!definition) throw new Error(`Unknown domain type: ${key}`);
  return definition;
}
function getOntologyPrompt() {
  const fields=definition=>Object.entries(definition.fields).map(([key,value])=>`${key}:${value.type}${value.required?' required':''}`).join(', ');
  return [`MusicMesh domain semantics ${ontology.version}`, ...ontology.rules,
    ...Object.values(ontology.entities).map(definition=>`${definition.key}: ${definition.meaning} Fields: ${fields(definition)}. Visibility: ${definition.visibility}.`),
    ...Object.values(ontology.relationships).map(definition=>`${definition.key}: ${definition.sourceTypes.join('/')} -> ${definition.targetTypes.join('/')}. ${definition.meaning} Fields: ${fields(definition)}. ${definition.evidenceRule}`),
    'Persist only the declared case-sensitive classes and relationship types. Never invent a predicate, provider ID, analysis measurement, or generic Entity fallback.',
    'Chat may reference stored public catalog entities by matchedCanonId. Provider and acoustic relationships may only be reused with an existing matchedRelationshipId and the same directed endpoints/type. Never create MusicBrainzRelationship or RedirectsTo from model knowledge.',
    'Personal ListeningEvent and IdentityMapping data, AcousticAnalysis and SimilarityAssessment are importer-owned. Chat cannot create or alter these records.',
    'New chat assertions have source chat and remain distinct from provider evidence. Include each relationship assertionKey and required structural properties. Use explicit temporary IDs for endpoints; names alone do not establish identity.',
    'When a relation has no supported class or cannot be grounded, return needs_human_input and explain the missing evidence or modeling definition. Preserve a useful direct answer without claiming a graph write.'
  ].join("\n");
}
module.exports = { PreferenceSignal, AssertionSubject, AssertionFactor, SupportedBySource, PreferenceFor, getOntology, getTypeDefinition, getOntologyPrompt, DomainEntity, DomainRelationship, Artist, Work, Recording, ReleaseGroup, Release, Label, Area, Place, Event, Instrument, Genre, Series, Url, Medium, Track, ArtistCredit, ListeningEvent, IdentityMapping, AcousticAnalysis, SimilarityAssessment, MusicScene, Style, RecordingSession, Project, Mix, Master, Stem, Equipment, Amplifier, EffectsPedal, Guitar, Synthesizer, Console, SignalChain, Company, Technique, Process, Format, Technology, SourceDocument, EvidenceAssertion, EditionOf, ReleaseLabel, RedirectsTo, CreditsArtist, MusicBrainzRelationship, HasMedium, HasTrack, UsesRecording, CreditedAs, PerformanceOf, HasMapping, MapsToRecording, AnalysisOf, ComparesRecording, SupportedByAnalysis };
