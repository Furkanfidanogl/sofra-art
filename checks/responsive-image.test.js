import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../src/image-manifest.json' with {type:'json'};
import {imageSource,imageAttributes,HERO_SIZES} from '../src/responsive-image.js';
test('responsive local variants match their sources, exist and share the hero preload contract',()=>{
  for(const [src,value]of Object.entries(manifest)){
    const source=fs.readFileSync(new URL('../public'+src,import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'),value.sourceHash,'Regenerate variants when a source image changes');
    assert.ok(value.sources.length>=3);let width=0;
    for(const item of value.sources){assert.ok(item.width>width);width=item.width;assert.equal(fs.statSync(new URL('../public'+item.src,import.meta.url)).size,item.bytes);}
    assert.equal(imageSource(src),value.sources.at(-1).src);
    assert.match(imageAttributes(src),/srcset=/);
  }
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.includes(`imagesizes="${HERO_SIZES}"`));
  assert.ok(html.includes(imageSource('/images/moon-terrace.webp')));
});
test('arbitrary or private uploaded images never enter the local transformation allowlist',()=>{
  for(const src of ['toString','__proto__','constructor','https://example.com/private','https://europe-west1-sofra-512816.cloudfunctions.net/publicArtwork?id=art-test','/images/../secret','" onerror="alert(1)']){assert.equal(imageSource(src),src);assert.equal(imageAttributes(src),'');}
});
