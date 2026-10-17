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
  if(type==='release') {if(raw.date)properties.date=raw.date;if(raw.barcode!==null&&raw.barcode!==undefined)properties.barcode=raw.barcode;}
  if(type==='artist' && raw.type)properties.artistType=raw.type;
  return new Class({name:raw.name || raw.title || raw.resource || `Unhydrated ${type} (${raw.id})`,externalId:{provider:'musicbrainz',type,value:raw.id},properties});
}
function catalogGraph(type,response) {
  const raw=response.body;
  const evidence={url:response.url,retrievedAt:response.fetchedAt,responseHash:response.bodyHash || hash(raw)};
  const recording=providerEntity(type,raw,evidence,true);
  const nodes=new Map([[recording.id,recording]]),relationships=[];
  function add(node) {if(!nodes.has(node.id))nodes.set(node.id,node);return nodes.get(node.id);}
  function billing(owner,raw) {
  const credits=(raw['artist-credit'] || []).map(item=>{
    const artist=add(providerEntity('artist',item.artist,evidence));
    return {artistId:artist.id,creditedName:item.name,joinPhrase:item.joinphrase || ''};
  });
  if(credits.length) {
    const credit=add(new domain.ArtistCredit({id:`musicbrainz-credit:${hash(credits)}`,name:credits.map(c=>c.creditedName+c.joinPhrase).join(''),properties:{credits,source:'musicbrainz',evidenceBasis:'provider'}}));
    relationships.push(new domain.CreditedAs({source:owner,target:credit,assertionKey:'musicbrainz-billing',properties:{source:'musicbrainz'}}));
    credits.forEach((item,position)=>relationships.push(new domain.CreditsArtist({source:credit,target:nodes.get(item.artistId),assertionKey:`position:${position}`,properties:{position,source:'musicbrainz'}})));
  }
  }
  billing(recording,raw);
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
  // Native fields are retained as typed context identities, not invented relationship UUIDs.
  for(const key of ['area','begin-area','end-area'])if(raw[key])add(providerEntity('area',raw[key],evidence));
  if(type==='release') {
    require('./catalogClosure').validateCatalog('release',raw);
    if(raw['release-group']) {
      const group=add(providerEntity('release-group',raw['release-group'],evidence));
      relationships.push(new domain.EditionOf({source:recording,target:group,assertionKey:'release-group',properties:{source:'musicbrainz',providerEvidence:evidence}}));
    }
    for(const info of raw['label-info']||[])if(info.label){
      const label=add(providerEntity('label',info.label,evidence));
      const properties={source:'musicbrainz',providerEvidence:evidence};if(info['catalog-number']!==null&&info['catalog-number']!==undefined)properties.catalogNumber=info['catalog-number'];
      relationships.push(new domain.ReleaseLabel({source:recording,target:label,assertionKey:'label-info:'+hash({labelId:label.id,catalogNumber:info['catalog-number']??null}),properties}));
    }
    for(const media of raw.media) {
      const medium=add(new domain.Medium({id:`musicmesh:medium:${raw.id}:${media.position}`,name:media.title||`Medium ${media.position}`,properties:{releaseId:recording.id,position:media.position,...(media.format?{format:media.format}:{}),source:'musicbrainz',providerEvidence:evidence}}));
      relationships.push(new domain.HasMedium({source:recording,target:medium,assertionKey:'medium',properties:{source:'musicbrainz'}}));
      for(const item of [...(media.pregap?[media.pregap]:[]),...media.tracks,...(media['data-tracks']||[])]) {
        const audio=add(providerEntity('recording',item.recording,evidence));
        const track=add(new domain.Track({externalId:{provider:'musicbrainz',type:'track',value:item.id},name:item.title||item.recording.title,
          properties:{mediumId:medium.id,position:item.position,recordingId:audio.id,number:item.number||String(item.position),source:'musicbrainz',providerEvidence:evidence,rawProvider:item}}));
        relationships.push(new domain.HasTrack({source:medium,target:track,assertionKey:'track-position',properties:{source:'musicbrainz'}}));
        relationships.push(new domain.UsesRecording({source:track,target:audio,assertionKey:'track-recording',properties:{source:'musicbrainz'}}));
        billing(track,item);
      }
    }
  }
  return {nodes:[...nodes.values()],relationships};
}
function recordingGraph(response){return catalogGraph('recording',response);}
module.exports={catalogGraph,recordingGraph,providerEntity};
