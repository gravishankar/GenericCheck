/* FixIndex mock database — 15 fictional consumer-electronics items.
   Every brand and model is invented; scores are illustrative only.
   Each item carries domain-specific attributes consumed by the scoring engine. */

const CATEGORIES = ['Smartphones', 'Laptops', 'Tablets', 'Earbuds', 'Smartwatches'];

const ITEMS = [
  {
    barcode: '0012345678905',
    brand: 'Nimbus',
    model: 'Aster 6',
    category: 'Smartphones',
    subcategory: 'Mid-range smartphone',
    attrs: {
      partsAvailability: 90,   // 0-100, official + third-party parts sold for 7+ years
      repairManuals: 95,       // 0-100, free official teardown guides + schematics
      disassemblyDifficulty: 10, // 0 (modular, screws only) - 100 (fused, glued, no entry point)
      batteryReplaceability: 90, // 0-100, user-replaceable w/ standard tools
      sparePartsPriceIndex: 55,  // 0 (parts cost > 60% of device price) - 100 (parts < 10%)
      softwareSupportYears: 6,
      partsPairingLock: false,   // serialized components that brick on swap
    },
  },
  {
    barcode: '0012345678912',
    brand: 'Nimbus',
    model: 'Aster 6 Pro',
    category: 'Smartphones',
    subcategory: 'Flagship smartphone',
    attrs: {
      partsAvailability: 60, repairManuals: 45,
      disassemblyDifficulty: 70, batteryReplaceability: 25,
      sparePartsPriceIndex: 30, softwareSupportYears: 7,
      partsPairingLock: true,
    },
  },
  {
    barcode: '0012345678929',
    brand: 'Kettle',
    model: 'Cobalt X',
    category: 'Smartphones',
    subcategory: 'Flagship smartphone',
    attrs: {
      partsAvailability: 75, repairManuals: 80,
      disassemblyDifficulty: 45, batteryReplaceability: 55,
      sparePartsPriceIndex: 45, softwareSupportYears: 5,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345678936',
    brand: 'Kettle',
    model: 'Cobalt Lite',
    category: 'Smartphones',
    subcategory: 'Mid-range smartphone',
    attrs: {
      partsAvailability: 70, repairManuals: 65,
      disassemblyDifficulty: 40, batteryReplaceability: 60,
      sparePartsPriceIndex: 50, softwareSupportYears: 4,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345678943',
    brand: 'Filament',
    model: 'Crossover 14',
    category: 'Laptops',
    subcategory: 'Ultrathin laptop',
    attrs: {
      partsAvailability: 85, repairManuals: 90,
      disassemblyDifficulty: 30, batteryReplaceability: 80,
      sparePartsPriceIndex: 50, softwareSupportYears: 8,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345678950',
    brand: 'Filament',
    model: 'Crossover 16 Max',
    category: 'Laptops',
    subcategory: 'Ultrathin laptop',
    attrs: {
      partsAvailability: 55, repairManuals: 40,
      disassemblyDifficulty: 75, batteryReplaceability: 20,
      sparePartsPriceIndex: 25, softwareSupportYears: 8,
      partsPairingLock: true,
    },
  },
  {
    barcode: '0012345678967',
    brand: 'Anvil',
    model: 'Workbench 15',
    category: 'Laptops',
    subcategory: 'Serviceable workstation',
    attrs: {
      partsAvailability: 95, repairManuals: 100,
      disassemblyDifficulty: 5, batteryReplaceability: 95,
      sparePartsPriceIndex: 80, softwareSupportYears: 10,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345678974',
    brand: 'Anvil',
    model: 'Workbench 15 Air',
    category: 'Laptops',
    subcategory: 'Serviceable workstation',
    attrs: {
      partsAvailability: 80, repairManuals: 85,
      disassemblyDifficulty: 25, batteryReplaceability: 70,
      sparePartsPriceIndex: 65, softwareSupportYears: 8,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345678981',
    brand: 'Slate & Co',
    model: 'Chalk Pad 11',
    category: 'Tablets',
    subcategory: 'Consumer tablet',
    attrs: {
      partsAvailability: 65, repairManuals: 55,
      disassemblyDifficulty: 80, batteryReplaceability: 30,
      sparePartsPriceIndex: 35, softwareSupportYears: 5,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345678998',
    brand: 'Slate & Co',
    model: 'Chalk Pad 11 Pro',
    category: 'Tablets',
    subcategory: 'Consumer tablet',
    attrs: {
      partsAvailability: 50, repairManuals: 30,
      disassemblyDifficulty: 90, batteryReplaceability: 15,
      sparePartsPriceIndex: 25, softwareSupportYears: 6,
      partsPairingLock: true,
    },
  },
  {
    barcode: '0012345679001',
    brand: 'Hearth',
    model: 'Field Tab R',
    category: 'Tablets',
    subcategory: 'Rugged tablet',
    attrs: {
      partsAvailability: 90, repairManuals: 95,
      disassemblyDifficulty: 20, batteryReplaceability: 90,
      sparePartsPriceIndex: 70, softwareSupportYears: 7,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345679018',
    brand: 'Echo Dot Labs',
    model: 'Pip 3',
    category: 'Earbuds',
    subcategory: 'True wireless earbuds',
    attrs: {
      partsAvailability: 15, repairManuals: 20,
      disassemblyDifficulty: 100, batteryReplaceability: 0,
      sparePartsPriceIndex: 5, softwareSupportYears: 3,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345679025',
    brand: 'Echo Dot Labs',
    model: 'Pip 3 Modular',
    category: 'Earbuds',
    subcategory: 'True wireless earbuds',
    attrs: {
      partsAvailability: 55, repairManuals: 60,
      disassemblyDifficulty: 60, batteryReplaceability: 40,
      sparePartsPriceIndex: 40, softwareSupportYears: 4,
      partsPairingLock: false,
    },
  },
  {
    barcode: '0012345679032',
    brand: 'Cinder',
    model: 'Wristnote 2',
    category: 'Smartwatches',
    subcategory: 'Smartwatch',
    attrs: {
      partsAvailability: 40, repairManuals: 35,
      disassemblyDifficulty: 85, batteryReplaceability: 20,
      sparePartsPriceIndex: 20, softwareSupportYears: 4,
      partsPairingLock: true,
    },
  },
  {
    barcode: '0012345679049',
    brand: 'Cinder',
    model: 'Wristnote 2 Field',
    category: 'Smartwatches',
    subcategory: 'Smartwatch',
    attrs: {
      partsAvailability: 60, repairManuals: 65,
      disassemblyDifficulty: 55, batteryReplaceability: 45,
      sparePartsPriceIndex: 45, softwareSupportYears: 5,
      partsPairingLock: false,
    },
  },
];
