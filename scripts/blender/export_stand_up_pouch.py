import bpy, json, hashlib, math
from pathlib import Path
from collections import defaultdict
out=Path(bpy.data.filepath).resolve().parent
if not bpy.data.filepath: raise RuntimeError('Save the Blender master before export.')
repo=Path(__file__).resolve().parents[2]
bpy.context.window.scene=bpy.data.scenes['Scene']
master=bpy.data.objects['Pouch | Inflation 0 flat - 1 filled']
if master.get('UV layout version')!=2:
    raise RuntimeError('This export requires the continuous 564 x 180 mm Blender UV layout.')
key=master.data.shape_keys.key_blocks['Inflation']
solid=master.modifiers.get('Film thickness | 0.12 mm')
solid.show_viewport=False
# Bake identical subdivision in both poses; Apply Modifiers in glTF drops morphs.
poses=[]; baked=None
for value in [0.,1.]:
    key.value=value; bpy.context.view_layer.update()
    ev=master.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
    poses.append([v.co.copy() for v in me.vertices])
    if baked is None: baked=me
    else:
        assert len(me.vertices)==len(baked.vertices)
        assert [tuple(p.vertices) for p in me.polygons]==[tuple(p.vertices) for p in baked.polygons]
        bpy.data.meshes.remove(me)
export=bpy.data.objects.new('POUCH_STRAIGHT_180x260',baked)
bpy.context.scene.collection.objects.link(export)
export.shape_key_add(name='Basis')
target=export.shape_key_add(name='Inflation')
for v,co in zip(target.data,poses[1]): v.co=co
target.value=1.
export['assetVersion']='3.1'
export['construction']='Authored visual preview. 180 x 260 mm, 44 mm depth, 8.3 mm inset. Not manufacturer certified.'
export['textureAtlas']='564 x 180 mm continuous front-gusset-back web; glTF texture flipY=false.'
# Extract UV island outlines and material-transition guides from the actual
# master. All coordinates use the exported glTF convention (origin top-left).
me=master.data
uv=me.uv_layers.active.data
panelids=me.attributes['panel_id'].data
edges=defaultdict(list)
for poly in me.polygons:
    region=panelids[poly.index].value
    if region>2: continue
    loops=list(poly.loop_indices)
    for i,li in enumerate(loops):
        lj=loops[(i+1)%len(loops)]
        a=tuple(round(float(c),7) for c in (uv[li].uv.x,1-uv[li].uv.y))
        b=tuple(round(float(c),7) for c in (uv[lj].uv.x,1-uv[lj].uv.y))
        if a!=b: edges[(region,tuple(sorted((a,b))))].append(poly.material_index)

def trace(segments):
    adjacency=defaultdict(list)
    for a,b in segments: adjacency[a].append(b); adjacency[b].append(a)
    unused=set(tuple(sorted(e)) for e in segments)
    paths=[]
    while unused:
        a,b=next(iter(unused))
        endpoints=[v for v in adjacency if len(adjacency[v])!=2 and any(tuple(sorted((v,w))) in unused for w in adjacency[v])]
        start=endpoints[0] if endpoints else a
        points=[start]; prev=None; current=start
        while True:
            candidates=[w for w in adjacency[current] if tuple(sorted((current,w))) in unused]
            if not candidates: break
            nxt=candidates[0]; unused.remove(tuple(sorted((current,nxt))))
            points.append(nxt); prev,current=current,nxt
            if current==start: break
        closed=len(points)>2 and points[-1]==points[0]
        if closed: points.pop()
        paths.append({'points':[n for pair in points for n in pair],'closed':closed})
    return paths
# Shared UV edges between panels are fold joins, not cuts through the film.
all_edges=defaultdict(list)
for (region,edge),mats in edges.items(): all_edges[edge].extend([region]*len(mats))
cuts=trace([edge for edge,regions in all_edges.items() if len(regions)==1])
joins=trace([edge for edge,regions in all_edges.items() if len(set(regions))>1])
technical=trace([edge for (region,edge),mats in edges.items() if len(set(mats))>1])
gusset_uv=[(float(uv[li].uv.x),1-float(uv[li].uv.y)) for poly in me.polygons if panelids[poly.index].value==2 for li in poly.loop_indices]
fold_x=(min(p[0] for p in gusset_uv)+max(p[0] for p in gusset_uv))/2
fold_min=min(p[1] for p in gusset_uv); fold_max=max(p[1] for p in gusset_uv)
manifest={
 'version':3,'layoutVersion':2,'modelUrl':'/models/blender-stand-up-pouch-v3.glb','meshName':export.name,
 'inflationTarget':'Inflation','textureFlipY':False,
 'dimensionsMm':{'width':180,'height':260,'depth':44.08,'gussetInset':8.3},
 'atlas':{'widthMm':564,'heightMm':180,'editorWidth':2256,'editorHeight':720},
 'panels':[
  {'id':'front','label':'Front','x':0,'y':0,'width':260/564,'height':1,'contentRotation':-90},
  {'id':'gusset','label':'Bottom gusset','x':260/564,'y':0,'width':44/564,'height':1,'contentRotation':-90},
  {'id':'back','label':'Back','x':304/564,'y':0,'width':260/564,'height':1,'contentRotation':90}],
 'guides':{'cuts':cuts,'technical':technical,'creases':joins+[{'points':[fold_x,fold_min,fold_x,fold_max],'closed':False}]},
 'provenance':'Authored Blender visualization. Guides are extracted from mesh UV boundaries and material transitions, not a certified manufacturing die.'}
for ob in bpy.context.view_layer.objects:
    if not ob.hide_get(): ob.select_set(False)
export.select_set(True); bpy.context.view_layer.objects.active=export
path=repo/'public/models/blender-stand-up-pouch-v3.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=False,export_morph=True,export_morph_normal=True,export_animations=False,export_extras=True,export_yup=True,export_texcoords=True,export_normals=True)
manifest['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
manifest['bytes']=path.stat().st_size
manifest['bakedVertices']=len(baked.vertices)
manifest['triangles']=sum(len(p.vertices)-2 for p in baked.polygons)
(repo/'src/lib/configurator/generated/blender-pouch-v3.json').write_text(json.dumps(manifest,indent=2))
(out/'blender-pouch-v3.manifest.json').write_text(json.dumps(manifest,indent=2))
(out/'blender-stand-up-pouch-v3.glb').write_bytes(path.read_bytes())
bpy.data.objects.remove(export,do_unlink=True)
solid.show_viewport=True; key.value=1.
master.select_set(True); bpy.context.view_layer.objects.active=master
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Stand-Up Pouch - Straight Sides Deep Gusset.blend'))
(out/'export-complete-v3.json').write_text(json.dumps({k:manifest[k] for k in ['sha256','bytes','bakedVertices','triangles']}))
print('POUCH V3 EXPORTED',manifest['bytes'],'bytes,',manifest['bakedVertices'],'vertices, morph and UV retained')
