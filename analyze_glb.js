const { NodeIO } = require('@gltf-transform/core');
const io = new NodeIO();
io.read('public/models/open_book/open_book.glb').then(doc => {
    const root = doc.getRoot();
    const meshes = root.listMeshes();
    meshes.forEach((mesh, index) => {
        console.log(`Mesh ${index}: ${mesh.getName()}`);
        mesh.listPrimitives().forEach(prim => {
            const position = prim.getAttribute('POSITION');
            if (!position) return;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let i = 0; i < position.getCount(); i++) {
                const p = position.getElement(i, []);
                if (p[0] < minX) minX = p[0];
                if (p[1] < minY) minY = p[1];
                if (p[2] < minZ) minZ = p[2];
                if (p[0] > maxX) maxX = p[0];
                if (p[1] > maxY) maxY = p[1];
                if (p[2] > maxZ) maxZ = p[2];
            }
            console.log(`  Dims: ${(maxX - minX).toFixed(4)} x ${(maxY - minY).toFixed(4)} x ${(maxZ - minZ).toFixed(4)}`);
            console.log(`  Min: ${minX.toFixed(4)}, ${minY.toFixed(4)}, ${minZ.toFixed(4)}`);
            console.log(`  Max: ${maxX.toFixed(4)}, ${maxY.toFixed(4)}, ${maxZ.toFixed(4)}`);
        });
    });
}).catch(err => console.error(err));
