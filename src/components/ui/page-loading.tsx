export function PageLoading({label='Loading page...'}:{label?:string}){
  return <div role="status" aria-label={label} aria-busy="true" className="tc-page-loading"><span aria-hidden="true"/><span className="sr-only">{label}</span></div>;
}
