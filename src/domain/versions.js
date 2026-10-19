// These revisions only added classes/fields or widened assertion scopes. Every
// historical object still passes today's constructors and endpoint validation.
const supported=new Set(['1.0.0','1.1.0','1.2.0','1.3.0','1.3.1']);
function assertOntologyVersion(version){
 if(!supported.has(version))throw new Error('Unsupported ontology version: '+version);
 return version;
}
module.exports={assertOntologyVersion};
