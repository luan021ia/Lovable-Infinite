// zip-utils.js - Utilitário para criar arquivos ZIP
// Implementação simplificada para Chrome Extension MV3

const ZipUtils = {
    // CRC32 table
    crcTable: null,

    makeCRCTable() {
        if (this.crcTable) return this.crcTable;
        const table = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            table[n] = c;
        }
        this.crcTable = table;
        return table;
    },

    crc32(data) {
        const table = this.makeCRCTable();
        let crc = 0 ^ (-1);
        for (let i = 0; i < data.length; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
        }
        return (crc ^ (-1)) >>> 0;
    },

    // Converte string para Uint8Array (UTF-8)
    stringToBytes(str) {
        return new TextEncoder().encode(str);
    },

    // Escreve um número como little-endian
    writeUint16LE(value) {
        return new Uint8Array([value & 0xFF, (value >> 8) & 0xFF]);
    },

    writeUint32LE(value) {
        return new Uint8Array([
            value & 0xFF,
            (value >> 8) & 0xFF,
            (value >> 16) & 0xFF,
            (value >> 24) & 0xFF
        ]);
    },

    // Combina múltiplos Uint8Arrays
    concat(...arrays) {
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    },

    // Converte data para formato DOS
    dateToDos(date) {
        const d = date || new Date();
        const dosTime = (d.getSeconds() >> 1) | (d.getMinutes() << 5) | (d.getHours() << 11);
        const dosDate = d.getDate() | ((d.getMonth() + 1) << 5) | ((d.getFullYear() - 1980) << 9);
        return { time: dosTime, date: dosDate };
    },

    // Cria um arquivo ZIP a partir de uma lista de arquivos
    async createZip(files) {
        // files = [{ name: 'path/file.txt', content: Uint8Array | string, binary: bool }]
        const localHeaders = [];
        const centralHeaders = [];
        let offset = 0;

        const dosDateTime = this.dateToDos(new Date());

        for (const file of files) {
            const fileName = this.stringToBytes(file.name);
            let content;
            
            if (file.content instanceof Uint8Array) {
                content = file.content;
            } else if (typeof file.content === 'string') {
                content = this.stringToBytes(file.content);
            } else {
                content = new Uint8Array(0);
            }

            const crc = this.crc32(content);
            const size = content.length;

            // Local file header
            const localHeader = this.concat(
                new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // signature
                this.writeUint16LE(20),                   // version needed
                this.writeUint16LE(0),                    // general purpose flag
                this.writeUint16LE(0),                    // compression (0 = store)
                this.writeUint16LE(dosDateTime.time),     // mod time
                this.writeUint16LE(dosDateTime.date),     // mod date
                this.writeUint32LE(crc),                  // crc32
                this.writeUint32LE(size),                 // compressed size
                this.writeUint32LE(size),                 // uncompressed size
                this.writeUint16LE(fileName.length),      // filename length
                this.writeUint16LE(0),                    // extra field length
                fileName,                                 // filename
                content                                   // file data
            );

            localHeaders.push(localHeader);

            // Central directory header
            const centralHeader = this.concat(
                new Uint8Array([0x50, 0x4B, 0x01, 0x02]), // signature
                this.writeUint16LE(20),                   // version made by
                this.writeUint16LE(20),                   // version needed
                this.writeUint16LE(0),                    // general purpose flag
                this.writeUint16LE(0),                    // compression
                this.writeUint16LE(dosDateTime.time),     // mod time
                this.writeUint16LE(dosDateTime.date),     // mod date
                this.writeUint32LE(crc),                  // crc32
                this.writeUint32LE(size),                 // compressed size
                this.writeUint32LE(size),                 // uncompressed size
                this.writeUint16LE(fileName.length),      // filename length
                this.writeUint16LE(0),                    // extra field length
                this.writeUint16LE(0),                    // comment length
                this.writeUint16LE(0),                    // disk number start
                this.writeUint16LE(0),                    // internal attributes
                this.writeUint32LE(0),                    // external attributes
                this.writeUint32LE(offset),               // relative offset
                fileName                                  // filename
            );

            centralHeaders.push(centralHeader);
            offset += localHeader.length;
        }

        // End of central directory
        const centralDirSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);
        const centralDirOffset = offset;

        const endOfCentralDir = this.concat(
            new Uint8Array([0x50, 0x4B, 0x05, 0x06]), // signature
            this.writeUint16LE(0),                    // disk number
            this.writeUint16LE(0),                    // disk with central dir
            this.writeUint16LE(files.length),         // entries on disk
            this.writeUint16LE(files.length),         // total entries
            this.writeUint32LE(centralDirSize),       // central dir size
            this.writeUint32LE(centralDirOffset),     // central dir offset
            this.writeUint16LE(0)                     // comment length
        );

        // Combine all parts
        return this.concat(
            ...localHeaders,
            ...centralHeaders,
            endOfCentralDir
        );
    },

    // Inicia download de um blob
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: true
        }, (downloadId) => {
            // Cleanup após um tempo
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        });
    }
};

// Exporta para uso no service worker
if (typeof self !== 'undefined') {
    self.ZipUtils = ZipUtils;
}
