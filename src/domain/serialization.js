const domain=require('./index');
function canonicalJson(value) {
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function entityFromGraph(node,{preserveOntologyVersion=false}={}) {
  const type=node.labels?.[0];
  if(node.labels?.length!==1 || !Object.hasOwn(domain.getOntology().entities,type))throw new Error('Unknown or ambiguous entity class');
  const {id,name,externalId,ontologyVersion,...properties}=node.properties || {};
  if(id!==undefined && id!==node.id)throw new Error('Conflicting graph/domain identity');
  if(ontologyVersion!==undefined)require('./versions').assertOntologyVersion(ontologyVersion);
  return new domain[type]({id:node.id,name,externalId:externalId || null,properties,...(preserveOntologyVersion?{ontologyVersion}:{})});
}
function relationshipFromGraph(edge,nodes,{preserveOntologyVersion=false}={}) {
  if(!Object.hasOwn(domain.getOntology().relationships,edge.type))throw new Error('Unknown relationship class');
  const {assertionKey,ontologyVersion,...properties}=edge.properties || {};
  if(ontologyVersion!==undefined)require('./versions').assertOntologyVersion(ontologyVersion);
  const result=new domain[edge.type]({source:nodes.get(edge.source),target:nodes.get(edge.target),assertionKey,properties,...(preserveOntologyVersion?{ontologyVersion}:{})});
  if(result.id!==edge.id)throw new Error('Conflicting relationship identity');
  return result;
}
module.exports={canonicalJson,entityFromGraph,relationshipFromGraph};
