import struct, zlib, os

def create_png(width, height, r, g, b):
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

    raw = b''
    for _ in range(height):
        raw += b'\x00'
        for _ in range(width):
            raw += bytes([r, g, b])

    compressed = zlib.compress(raw)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)

    iend_crc = zlib.crc32(b'IEND')
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

    return sig + ihdr + idat + iend

out_dir = os.path.join(os.path.dirname(__file__), 'public')
os.makedirs(out_dir, exist_ok=True)

for size in [192, 512]:
    data = create_png(size, size, 0x25, 0x63, 0xeb)
    path = os.path.join(out_dir, f'icon-{size}.png')
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Created {path} ({len(data)} bytes)')
