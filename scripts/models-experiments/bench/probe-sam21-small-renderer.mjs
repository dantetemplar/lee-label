
import * as ort from 'bench://app/ort/ort.all.min.mjs'
const SIZE=1024, MEAN=[0.485,0.456,0.406], STD=[0.229,0.224,0.225]
const logEl=document.getElementById('log')
const log=m=>{logEl.textContent+='\n'+m; void window.sam3Api.log(m)}
async function copyT(t){const d=typeof t.getData==='function'?await t.getData():t.data; return d instanceof Float32Array?new Float32Array(d):Float32Array.from(d)}
let lastErr=null
async function hook(){const raw=ort.env.webgpu?.device; const d=raw instanceof Promise?await raw:raw; if(!d)return; d.addEventListener('uncapturederror',e=>{lastErr=new Error(e.error?.message||'gpu')})}
async function idle(){const raw=ort.env.webgpu?.device; const d=raw instanceof Promise?await raw:raw; if(d?.queue?.onSubmittedWorkDone) await d.queue.onSubmittedWorkDone(); if(lastErr){const e=lastErr; lastErr=null; throw e}}
window.__run=async()=>{
  const result={ok:false,model:'sam2.1-small',backend:'webgpu'}
  await window.sam3Api.vramStart()
  let enc,dec
  try{
    ort.env.logLevel='warning'; ort.env.wasm.wasmPaths='bench://app/ort/'; ort.env.wasm.numThreads=1
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'})
    ort.env.webgpu.adapter=adapter; ort.env.webgpu.powerPreference='high-performance'
    result.shaderF16=[...adapter.features].includes('shader-f16')
    const encBuf=await (await fetch('bench://app/models/encoder.onnx')).arrayBuffer()
    const decBuf=await (await fetch('bench://app/models/decoder.onnx')).arrayBuffer()
    log('enc='+(encBuf.byteLength/1e6).toFixed(0)+'MB')
    const imgRes=await fetch('bench://app/fixture.png'); const bmp=await createImageBitmap(await imgRes.blob())
    const c=document.createElement('canvas'); c.width=bmp.width; c.height=bmp.height
    const ctx=c.getContext('2d'); ctx.drawImage(bmp,0,0); const id=ctx.getImageData(0,0,c.width,c.height); bmp.close()
    const W=c.width,H=c.height, click={x:W*0.32,y:H*0.4}
    log('fixture '+W+'x'+H)
    const scale=SIZE/Math.max(W,H), nw=Math.round(W*scale), nh=Math.round(H*scale)
    const src=new OffscreenCanvas(W,H); src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(id.data),W,H),0,0)
    const dst=new OffscreenCanvas(SIZE,SIZE); const dctx=dst.getContext('2d'); dctx.drawImage(src,0,0,nw,nh)
    const px=dctx.getImageData(0,0,SIZE,SIZE).data
    const tensor=new Float32Array(3*SIZE*SIZE)
    for(let i=0;i<SIZE*SIZE;i++){const r=i*4; for(let ch=0;ch<3;ch++){tensor[ch*SIZE*SIZE+i]=(px[r+ch]/255-MEAN[ch])/STD[ch]}}
    const ep=[{name:'webgpu'}]
    const t0=performance.now()
    enc=await ort.InferenceSession.create(encBuf,{executionProviders:ep, graphOptimizationLevel:'disabled'})
    dec=await ort.InferenceSession.create(decBuf,{executionProviders:ep})
    await hook(); result.loadMs=performance.now()-t0
    lastErr=null
    const t1=performance.now()
    const eout=await enc.run({image:new ort.Tensor('float32',tensor,[1,3,SIZE,SIZE])})
    await idle(); result.encodeMs=performance.now()-t1
    const ie=await copyT(eout.image_embed), h0=await copyT(eout.high_res_feats_0), h1=await copyT(eout.high_res_feats_1)
    log('emb0 finite='+[...ie.slice(0,100)].every(Number.isFinite))
    const mx=click.x*scale, my=click.y*scale
    const feeds={
      point_coords:new ort.Tensor('float32',new Float32Array([mx,my]),[1,1,2]),
      point_labels:new ort.Tensor('float32',new Float32Array([1]),[1,1]),
      image_embed:new ort.Tensor('float32',ie,[1,256,64,64]),
      high_res_feats_0:new ort.Tensor('float32',h0,[1,32,256,256]),
      high_res_feats_1:new ort.Tensor('float32',h1,[1,64,128,128]),
      mask_input:new ort.Tensor('float32',new Float32Array(256*256),[1,1,256,256]),
      has_mask_input:new ort.Tensor('float32',new Float32Array([0]),[1])
    }
    lastErr=null
    const t2=performance.now()
    const dout=await dec.run(feeds); await idle(); result.decodeMs=performance.now()-t2
    const scores=await copyT(dout.iou_predictions)
    const masks=await copyT(dout.masks)
    const mh=256,mw=256
    const best=scores.indexOf(Math.max(...scores.slice(0,3)))
    const areas=[]
    for(let i=0;i<3;i++){let p=0; const off=i*mh*mw; for(let j=0;j<mh*mw;j++) if(masks[off+j]>0)p++; areas.push(p/(mh*mw))}
    log('scores=['+[...scores].slice(0,3).map(s=>s.toFixed(3))+'] best='+best+' areas=['+areas.map(a=>a.toFixed(4))+']')
    result.scores=[...scores].slice(0,3); result.best=best; result.areas=areas; result.ok=true
  }catch(e){result.error=e.message||String(e); log('ERROR '+result.error)}
  finally{result.vram=await window.sam3Api.vramStop(); try{await enc?.release(); await dec?.release()}catch{}}
  return result
}
log('ready'); await window.sam3Api.ready()
