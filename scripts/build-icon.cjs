// Use the sharp package supplied by the build environment. No online assets.
const fs=require('node:fs/promises'),path=require('node:path');
const sharp=require(require.resolve('sharp',{paths:[process.env.VOICEFLOW_BUILD_MODULES||'',path.join(__dirname,'../node_modules')]}));
(async()=>{
 const root=path.join(__dirname,'../assets'),svg=await fs.readFile(path.join(root,'icon.svg'));
 const sizes=[16,24,32,48,64,128,256];
 const images=await Promise.all(sizes.map(size=>sharp(svg).resize(size,size).png().toBuffer()));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 images.forEach((buffer,index)=>{const p=6+16*index,size=sizes[index];header[p]=size===256?0:size;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffer.length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffer.length;});
 await fs.writeFile(path.join(root,'icon.ico'),Buffer.concat([header,...images]));
 await sharp(svg).resize(512).png().toFile(path.join(root,'icon.png'));
 console.log('Built seven Windows icon sizes and PNG preview.');
})().catch(e=>{console.error(e);process.exitCode=1;});
