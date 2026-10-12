import {parseMerge,type Merge} from './model';

/** Excel print areas may contain multiple quoted, sheet-qualified rectangles. */
export function printAreas(value:string,sheet:string):Merge[]{
  const areas:Merge[]=[];
  const pattern=/(?:'(.+?)'|([^!,]+))!\s*(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)(?=\s*(?:,|$))/gi;
  for(const match of value.matchAll(pattern)){
    if((match[1]?.replace(/''/g,"'")??match[2]?.trim())!==sheet)continue;
    try{areas.push(parseMerge(match[3]));}catch{/* Invalid area: use worksheet content instead. */}
  }
  return areas;
}
