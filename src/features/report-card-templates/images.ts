import 'server-only';
import {xml,relationships,partPath,relsPath,type Package} from './package';
import type {SheetImage} from './model';

/** Only embedded raster images are exposed; external relationships are never fetched. */
export async function sheetImages(pkg:Package,sheet:string,columnWidth:(n:number)=>number,rowHeight:(n:number)=>number){
  const images:SheetImage[]=[];
  if(!pkg.names.includes(relsPath(sheet)))return images;
  let total=0;
  for(const drawing of relationships(await pkg.text(relsPath(sheet))).filter(r=>!r.external&&r.type.endsWith('/drawing'))){
    const path=partPath(sheet,drawing.target),rels=relationships(await pkg.text(relsPath(path)));
    type Anchor={from:Record<string,number>;to:Record<string,number>;x:number;y:number;width:number;height:number;id:string;name:string;kind:string;shape?:string;text:string[];font:string;fontSize:number;italic:boolean;bold:boolean;fill:string;stroke:string};
    const anchors:Anchor[]=[];let anchor:Anchor|undefined;
    xml(await pkg.text(path),'wsDr',{open:(name,a,stack)=>{
      if(['twoCellAnchor','oneCellAnchor','absoluteAnchor'].includes(name))anchor={from:{},to:{},x:0,y:0,width:0,height:0,id:'',name:'Report card image',kind:name,text:[],font:'Calibri',fontSize:14.667,italic:false,bold:false,fill:'none',stroke:'none'};
      if(!anchor)return;
      if(name==='prstGeom'&&stack.includes('sp'))anchor.shape=a.prst;
      if((name==='p'||name==='br')&&stack.includes('txBody'))anchor.text.push('');
      if(['rPr','defRPr'].includes(name)&&stack.includes('txBody')){if(a.sz)anchor.fontSize=Number(a.sz)/100*4/3;anchor.italic=a.i==='1';anchor.bold=a.b==='1';}
      if(name==='latin'&&a.typeface)anchor.font=a.typeface;
      if(name==='srgbClr'&&stack.includes('spPr')&&/^[a-f\d]{6}$/i.test(a.val??'')){if(stack.includes('ln'))anchor.stroke='#'+a.val;else anchor.fill='#'+a.val;}
      if(name==='blip')anchor.id=a['r:embed']??Object.entries(a).find(([key])=>key.endsWith(':embed'))?.[1]??'';
      if(name==='cNvPr')anchor.name=a.descr||a.name||anchor.name;
      if(name==='pos'){anchor.x=Number(a.x)/9525;anchor.y=Number(a.y)/9525;}
      if(name==='ext'&&stack.length===3){anchor.width=Number(a.cx)/9525;anchor.height=Number(a.cy)/9525;}
    },text:(value,stack)=>{if(!anchor)return;if(stack.at(-1)==='t'&&stack.includes('txBody')){if(!anchor.text.length)anchor.text.push('');anchor.text[anchor.text.length-1]+=value;}const side=stack.at(-2);if(side==='from'||side==='to')anchor[side][stack.at(-1)!]=Number(value);},close:name=>{if(anchor&&name===anchor.kind){anchors.push(anchor);anchor=undefined;}}});
    const coordinate=(point:Record<string,number>,axis:'col'|'row')=>{
      const count=point[axis];if(!Number.isInteger(count)||count<0||count>(axis==='col'?128:2000))return NaN;
      let result=(point[axis+'Off']??0)/9525;for(let i=1;i<=count;i++)result+=axis==='col'?columnWidth(i):rowHeight(i);return result;
    };
    for(const a of anchors){
      const x=a.kind==='absoluteAnchor'?a.x:coordinate(a.from,'col'),y=a.kind==='absoluteAnchor'?a.y:coordinate(a.from,'row');
      const width=a.kind==='twoCellAnchor'?coordinate(a.to,'col')-x:a.width,height=a.kind==='twoCellAnchor'?coordinate(a.to,'row')-y:a.height;
      if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<=0||height<=0)continue;
      if(images.length>=40)continue;
      let src:string;
      const rel=rels.find(r=>r.id===a.id&&!r.external&&r.type.endsWith('/image'));
      if(rel){
        const bytes=await pkg.binary(partPath(path,rel.target));total+=bytes.length;if(total>4*1024*1024)continue;
        const mime=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,6).toString().match(/^GIF8[79]a$/)?'image/gif':null;
        if(!mime)continue;src=`data:${mime};base64,${bytes.toString('base64')}`;
      }else if(['ellipse','rect','roundRect'].includes(a.shape??'')){
        // Reconstruct supported DrawingML shapes from inert text and numeric data only.
        const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
        const fontSize=Number.isFinite(a.fontSize)?Math.min(200,Math.max(1,a.fontSize)):14.667,lineHeight=fontSize*1.2;
        const shape=a.shape==='ellipse'?`<ellipse cx="${width/2}" cy="${height/2}" rx="${Math.max(0,width/2-1)}" ry="${Math.max(0,height/2-1)}"/>`:`<rect x="1" y="1" width="${Math.max(0,width-2)}" height="${Math.max(0,height-2)}" rx="${a.shape==='roundRect'?8:0}"/>`;
        const textWidth=Math.max(fontSize,a.shape==='ellipse'?width*.72:width-16);
        const wrapped=a.text.flatMap(paragraph=>{const lines:string[]=[];let current='';for(const word of paragraph.split(/\s+/)){const next=current?current+' '+word:word;if(current&&next.length*fontSize*.55>textWidth){lines.push(current);current=word;}else current=next;}lines.push(current);return lines;});
        const text=wrapped.map((line,i)=>`<tspan x="${width/2}" y="${height/2-(wrapped.length-1)*lineHeight/2+i*lineHeight+fontSize*.35}">${escape(line)}</tspan>`).join('');
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="${a.fill}" stroke="${a.stroke}">${shape}</g><text text-anchor="middle" fill="#000" font-family="${escape(a.font)}" font-size="${fontSize}" font-style="${a.italic?'italic':'normal'}" font-weight="${a.bold?'bold':'normal'}">${text}</text></svg>`;
        src=`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      }else continue;
      images.push({src,name:a.name,x,y,width,height});
    }
  }
  return images;
}
