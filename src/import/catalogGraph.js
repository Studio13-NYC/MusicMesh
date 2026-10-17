const {createHash}=require('node:crypto');
const domain=require('../domain');
const {canonicalJson}=require('../domain/serialization');
const hash=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const providerTypes=Object.fromEntries(Object.values(domain.getOntology().entities).filter(d=>d.providerType).map(d=>[d.providerType,d.key]));
function providerEntity(type,raw,evidence,hydrated=false) {
  const Class=domain[providerTypes[type]];
  if(!Class)throw new Error(`Unsupported MusicBrainz entity type ${type}`);
  const properties={source:'musicbrainz',evidenceBasis:'provider',hydrationStatus:hydrated?'lookup':'embedded',
    providerEvidence:evidence,rawProvider:raw};
  if(type==='recording') {
    if(raw.length!==null && raw.length!==undefined)properties.durationMs=raw.length;
    if(raw['first-release-date'])properties.firstReleaseDate=raw['first-release-date'];
  }
  if(type==='artist' && raw.type)properties.artistType=raw.type;
  return new Class({name:raw.name || raw.title || raw.resource || `Unhydrated ${type} (${raw.id})`,externalId:{provider:'musicbrainz',type,value:raw.id},properties});
}
function recordingGraph(response) {
  const raw=response.body;
  const evidence={url:response.url,retrievedAt:response.fetchedAt,responseHash:response.bodyHash || hash(raw)};
  const recording=providerEntity('recording',raw,evidence,true);
  const nodes=new Map([[recording.id,recording]]),relationships=[];
  function add(node) {if(!nodes.has(node.id))nodes.set(node.id,node);return nodes.get(node.id);}
  const credits=(raw['artist-credit'] || []).map(item=>{
    const artist=add(providerEntity('artist',item.artist,evidence));
    return {artistId:artist.id,creditedName:item.name,joinPhrase:item.joinphrase || ''};
  });
  if(credits.length) {
    const credit=add(new domain.ArtistCredit({id:`musicbrainz-credit:${hash(credits)}`,name:credits.map(c=>c.creditedName+c.joinPhrase).join(''),properties:{credits,source:'musicbrainz',evidenceBasis:'provider'}}));
    relationships.push(new domain.CreditedAs({source:recording,target:credit,assertionKey:'musicbrainz-billing',properties:{source:'musicbrainz'}}));
    credits.forEach((item,position)=>relationships.push(new domain.CreditsArtist({source:credit,target:nodes.get(item.artistId),assertionKey:`position:${position}`,properties:{position,source:'musicbrainz'}})));
  }
  for(const relation of raw.relations || []) {
    const type=relation['target-type'];
    if(!['forward','backward'].includes(relation.direction))throw new Error('Unknown MusicBrainz relationship direction');
    const related=add(providerEntity(type,relation[type],evidence));
    const [source,target]=relation.direction==='forward'?[recording,related]:[related,recording];
    const context={providerTypeId:relation['type-id'],providerTypeName:relation.type,sourceType:source.type,targetType:target.type,
      definitionUrl:`https://musicbrainz.org/relationship/${relation['type-id']}`,source:'musicbrainz',evidenceBasis:'provider',
      providerEvidence:evidence,rawProvider:relation,...(relation.begin?{beginDate:relation.begin}:{}),...(relation.end?{endDate:relation.end}:{})};
    // Stable assertion context excludes retrieval time and nested target metadata.
    const assertion={...relation};delete assertion[type];delete assertion.direction;delete assertion['target-type'];
    relationships.push(new domain.MusicBrainzRelationship({source,target,assertionKey:`musicbrainz:${hash(assertion)}`,properties:context}));
  }
  return {nodes:[...nodes.values()],relationships};
}
module.exports={recordingGraph,providerEntity};
