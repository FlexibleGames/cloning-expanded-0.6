"use strict";

const { api, enums, react } = sandkit;

const MOD_ID = "sirmonkz.cloning_expanded";
const FH = sandkit.engine.api;

const CHAMBER_ID = "cloningChamber";
const CHAMBER_SPRITE_ID = "cloning_chamber";
const SYRINGE_ID = "Syringe";
const SYRINGE_SPRITE_ID = "syringe";
const BLOCK_WIDTH = 8;
const BLOCK_HEIGHT = 12;
const YOUNG_ANIMATION_INTERVAL = 500;
const GROWTH_MAX = 100;
const NUTRIENT_FLUID_MATERIAL_ID = 200;
const EXTRACTION_COOLDOWN_MS = 120000; // 1000 = 1 second

const DNA_TYPES = [
  { id: "dnaShinelet", name: "Shinelet DNA", color: 0xf8fafc, sprite: "shinelet", creatureType: "shinelet", aliases: ["shinelet"] },
  { id: "dnaLumling", name: "Lumling DNA", color: 0x67e8f9, sprite: "lumling", creatureType: "lumling", aliases: ["lumling"] },
  { id: "dnaRedweaver", name: "Redweaver DNA", color: 0xff3b3b, sprite: "resinWeaver", creatureType: "resinWeaver", aliases: ["resinWeaver", "redweaver", "resinweaver"] },
  { id: "dnaVoltblub", name: "Voltblub DNA", color: 0xfde047, sprite: "eyes", creatureType: "eyes", aliases: ["eyes", "voltblub"] },
  { id: "dnaVoidgrazer", name: "Voidgrazer DNA", color: 0xe879f9, sprite: "voidgrazer", creatureType: "voidgrazer", aliases: ["voidgrazer"] },
  { id: "dnaChillow", name: "Chillow DNA", color: 0xdbeafe, sprite: "chillow", creatureType: "chillow", aliases: ["chillow", "chillo"] },
  { id: "dnaOxyblob", name: "Oxyblob DNA", color: 0x86efac, sprite: "oxyblob", creatureType: "oxyblob", aliases: ["oxyblob", "oxyBlob", "oxydrop", "oxyDrop", "oxygenblob", "oxygenBlob", "o2blob", "gasblob"] },
];

const CELL = (sandkit.enums && sandkit.enums.CellType) || {};
const ELEM = (sandkit.enums && sandkit.enums.ElementType) || {};
const CELL_BLOCK = CELL.Block != null ? CELL.Block : 15;
const CELL_SANDIUM_SOIL = CELL.SandiumSoil != null ? CELL.SandiumSoil : 28;
const ELEMENT_WATER = ELEM.Water != null ? ELEM.Water : 3;

function registeredElementType(result) {
  if (typeof result === "number") return result;
  if (result && typeof result.elementType === "number") return result.elementType;
  return null;
}

function typeIdOf(def) {
  if (!def) return "";
  if (typeof def === "string") return def;
  return String(def.id || def.typeId || def.type || "");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function definitionNames(def) {
  if (!def || typeof def !== "object") return [];
  return [
    def.id,
    def.typeId,
    def.type,
    def.name,
    def.displayName,
    def.spriteId,
    def.sprite,
    def.nameKey,
    def.description,
    def.shortDescription,
  ].map(normalizeName).filter(Boolean);
}

function wantedNames(dna) {
  const display = normalizeName(String(dna.name || "").replace(/dna$/i, ""));
  return [dna.creatureType, dna.sprite, display, ...(dna.aliases || [])]
    .map(normalizeName)
    .filter(Boolean);
}

function isOxyblobText(names) {
  return names.some((name) =>
    name.includes("oxyblob") ||
    name.includes("oxygenblob") ||
    name.includes("oxydrop") ||
    (name.includes("oxy") && name.includes("blob"))
  );
}

function definitionMatchesDna(def, dna) {
  const names = definitionNames(def);
  const wanted = wantedNames(dna);
  if (names.some((name) => wanted.includes(name))) return true;
  if (dna.id === "dnaOxyblob" && isOxyblobText(names)) return true;
  return wanted.some((name) => name.length >= 6 && names.some((candidate) => candidate.includes(name)));
}

function allCreatureDefinitions() {
  try {
    const all = api.entities.getAllTypeDefinitions();
    if (Array.isArray(all)) return all;
    if (all && typeof all === "object") return Object.values(all);
  } catch (error) {}
  return [];
}

function bindDnaToDefinition(dna, def) {
  const id = typeIdOf(def);
  if (id) dna.creatureType = id;
  dna.sprite = (def && (def.spriteId || def.sprite)) || id || dna.sprite;
}

function resolveCreatureIds() {
  const defs = allCreatureDefinitions();
  if (!defs.length) return;

  for (const dna of DNA_TYPES) {
    for (const def of defs) {
      if (!definitionMatchesDna(def, dna)) continue;
      bindDnaToDefinition(dna, def);
      break;
    }
  }
}

function dnaForCreature(creature) {
  const type = normalizeName(creature && (creature.type || creature.typeId));
  const direct = DNA_TYPES.find((dna) => type && wantedNames(dna).includes(type));
  if (direct) return direct;

  let def = null;
  try {
    def = api.entities.getTypeDefinitionById(creature && (creature.type || creature.typeId));
  } catch (error) {}

  if (!def && type) {
    def = allCreatureDefinitions().find((item) => definitionNames(item).includes(type)) || null;
  }

  if (!def) return null;

  const dna = DNA_TYPES.find((item) => definitionMatchesDna(def, item));
  if (dna) bindDnaToDefinition(dna, def);
  return dna || null;
}

function distanceToCreature(creature, x, y) {
  const originX = Number(creature && creature.x) || 0;
  const originY = Number(creature && creature.y) || 0;
  let best = Math.hypot(originX - x, originY - y);
  // Oxyblobs cling to the ceiling, so the body hangs below the entity origin.
  for (let drop = 16; drop <= 64; drop += 16) {
    best = Math.min(best, Math.hypot(originX - x, originY + drop - y));
  }
  return best;
}

function spawnCreature(ctx, typeId, x, y) {
  try {
    if (FH.entities && FH.entities.spawn) {
      FH.entities.spawn(ctx, typeId, x, y);
      return;
    }
  } catch (error) {}
  try {
    api.entities.spawnAtWorld(typeId, x, y);
  } catch (error) {
    console.warn("[Cloning Expanded] Spawn failed for " + typeId + ":", error.message);
  }
}

let nutrientFluidType = null;

// ==================== LOAD IMAGE ====================

async function loadImage(spriteName) {
  try {
    await api.sprites.loadFromMod(spriteName, "assets/" + spriteName + ".png");
    //console.log(`[Cloning Expanded] Loaded ${spriteName}`);
    return true;
  } catch (e) {
    console.warn(`[Cloning Expanded] Failed ${spriteName}:`, e.message);
    return false;
  }
}

// ==================== REGISTER NUTRIENT SHADER ====================

function registerNutrientFluidShader() {
  try {
    FH.rendering.shaders.register({
      materialId: NUTRIENT_FLUID_MATERIAL_ID,
      name: "nutrientFluid",
      isLiquid: true,
      shaderFunction: `vec4 nutrientFluid() {
        vec2 res = uResolution;
        vec2 screenCoord = vTextureCoord * uResolution;
        vec2 uv = screenCoord / res.xy;
        float t = time;
        
        // Flowing waves
        float wave1 = fbm(uv * 3.0 + vec2(t * 0.3, -t * 0.2));
        float wave2 = fbm(uv * 5.0 + vec2(-t * 0.25, t * 0.35) + 3.7);
        float flow = (wave1 + wave2) * 0.5;
        
        // Secondary flow pattern
        float streak = sin(uv.x * 12.0 + uv.y * 5.0 + t * 1.5);
        streak = pow(max(streak, 0.0), 3.0);
        
        // Bubbles with less distortion, sin-based upward movement, soft center-out look
        vec2 bubbleUv = uv * 60.0;
        bubbleUv.y *= 0.5;
        bubbleUv.y += t * 1.5; // Rise up

        // Less distortion - smaller amplitude
        float xDistortion = fbm(bubbleUv * 0.15 + vec2(t * 0.2, -t * 0.2));
        bubbleUv.x += xDistortion * 0.4 - 0.2; // Much less X shift

        // Sin-based swaying as bubbles rise
        bubbleUv.x += sin(bubbleUv.y * 0.8 + t * 0.6) * 0.1; // Gentle sway

        vec2 bubbleCell = floor(bubbleUv);
        vec2 bubbleFract = fract(bubbleUv);
        float bubbleDist = length(bubbleFract - 0.5);

        float bubbleSize = fbm(bubbleCell * 7.3 + vec2(t * 1.5, -t * 1.2));
        bubbleSize = 0.03 + bubbleSize * 0.08;

        // Soft center-out: 0.5 at center -> 1 at edge -> 0 outside
        float bubble = smoothstep(0.0, bubbleSize, bubbleDist);
        bubble *= 1.0 - smoothstep(bubbleSize, bubbleSize * 2.0, bubbleDist);

        float bubbleIntensity = fbm(bubbleCell * 2.7 + vec2(t * 1.8, t * 1.4));
        bubble *= 0.3 + bubbleIntensity * 0.4;

        float bubbleSeed = fract(sin(bubbleCell.x * 12.9898 + bubbleCell.y * 78.233) * 43758.5453);
        bubble *= bubbleSeed > 0.35 ? 1.0 : 0.0;

        float bubbleLife = fract(bubbleCell.x * 3.7 + bubbleCell.y * 9.1);
        float bubbleRise = bubbleLife * 0.8;
        float bubbleAlpha = smoothstep(0.0, 0.2, bubbleRise) * smoothstep(0.8, 0.5, bubbleRise);
        bubble *= bubbleAlpha;
        
        // Colors - nutrient green
        vec3 deepGreen = vec3(0.08, 0.30, 0.15);
        vec3 midGreen = vec3(0.18, 0.60, 0.32);
        vec3 brightGreen = vec3(0.38, 0.88, 0.48);
        vec3 glowGreen = vec3(0.58, 1.0, 0.68);
        
        // Base color from flow
        vec3 color = mix(deepGreen, midGreen, flow);
        
        // Add streak highlights
        color = mix(color, brightGreen, streak * 0.4);
        
        // Add bubbles
        color = mix(color, brightGreen, bubble * 0.5);
        color += glowGreen * bubble * 0.3;
        
        // Subtle pulse
        float pulse = 0.5 + 0.5 * sin(t * 1.2 + uv.x * 3.0 + uv.y * 2.0);
        color += glowGreen * pulse * 0.05;
        
        return vec4(clamp(color, 0.0, 1.0), 1.0);
      }`
    });
    console.log("[Cloning Expanded] Nutrient fluid shader registered");
    return true;
  } catch (e) {
    console.warn("[Cloning Expanded] Shader failed:", e.message);
    return false;
  }
}


// ==================== REGISTER NUTRIENT FLUID ====================

function registerNutrientFluid() {
  try {
    const result = api.elements.register({
      id: "nutrientFluid",
      name: "Nutrient Fluid",
      description: "A cloning medium made from water and florinol.",
      matterType: enums.MatterType.Liquid,
      density: 105,
      metaColor: 0x55ff55,
      materialId: NUTRIENT_FLUID_MATERIAL_ID,
      colors: { variants: [
        [85, 255, 85, 255],
        [180, 255, 180, 255],
      ]},
    });
    
    nutrientFluidType = registeredElementType(result);
    return true;
  } catch (e) {
    console.error("[Cloning Expanded] Failed to register nutrient fluid:", e);
    return false;
  }
}

// ==================== DNA PELLET ====================

function registerDNAPellet(dna) {
  try {
    const result = api.elements.register({
      id: dna.id,
      name: dna.name,
      description: `DNA sample for cloning a ${dna.name}.`,
      matterType: enums.MatterType.Solid,
      density: 100,
      metaColor: dna.color,
      colors: { variants: [
        [(dna.color >> 16) & 255, (dna.color >> 8) & 255, dna.color & 255, 255],
      ]},
    });
    
    dna.elementType = registeredElementType(result);
    return dna.elementType;
  } catch (e) {
    return null;
  }
}

// ==================== REGISTER REACTION ====================

function registerReaction() {
  try {
    const waterType = FH.elements.getElementTypeFromId(sandkit.state, "water");
    const florinolType = FH.elements.getElementTypeFromId(sandkit.state, "florinol");
    
    if (waterType === undefined || florinolType === undefined) {
      console.warn("[Cloning Expanded] Missing water or florinol");
      return false;
    }
    
    if (nutrientFluidType === null) {
      console.warn("[Cloning Expanded] Nutrient fluid not registered yet");
      return false;
    }
    
    api.reactions.registerContact({
      inputA: waterType,
      inputB: florinolType,
      outputA: nutrientFluidType,
      outputB: null,
      orientation: "any",
    });
    
    //console.log("[Cloning Expanded] Reaction: water + florinol → nutrient fluid");
    return true;
  } catch (e) {
    console.warn("[Cloning Expanded] Reaction failed:", e.message);
    return false;
  }
}

// ==================== DNA NEEDLE TOOL ====================

function registerDNANeedle() {
  try {
    // Register the item
    api.items.register({
      id: SYRINGE_ID,
      name: "DNA Swab",
      description: "Extracts DNA from creatures. " + EXTRACTION_COOLDOWN_MS/1000 + " s cooldown per creature.",
      categoryKey: "utility",
      
      sprite: {
        id: SYRINGE_SPRITE_ID,
        type: "onehand",
        ui: {
          imageName: SYRINGE_SPRITE_ID,
          size: { width: 25, height: 9 },
        },
      },
      
      config: {
        maxRange: 5,
      },
      
      handleAction: (e, t) => {
        if (!e.session.action.state[enums.ActionState.Active]) return;

        resolveCreatureIds();
        const mousePos = e.session.input.mouse.worldPosition;
        const creatures = FH.entities.getAll(e);
        let best = null;
        let bestDist = 72;

        for (const creature of creatures) {
          const dist = distanceToCreature(creature, mousePos.x, mousePos.y);
          if (dist >= bestDist) continue;
          const dnaInfo = dnaForCreature(creature);
          if (!dnaInfo || creature.dnaExtracted) continue;
          best = { creature, dnaInfo };
          bestDist = dist;
        }

        if (!best) return;

        const creature = best.creature;
        const dnaInfo = extractDNAFromCreature(e, creature);
        if (!dnaInfo) return;

        api.effects.createParticlesAtWorld(
          creature.x,
          creature.y,
          {
            count: 8,
            color: dnaInfo.color,
            minSpeed: 5,
            maxSpeed: 20,
            minSize: 0.3,
            maxSize: 0.8,
            minLifetime: 0.3,
            maxLifetime: 0.7,
          }
        );
      },
    });
    
    //console.log("[Cloning Expanded] DNA Needle registered!");
    return true;
  } catch (e) {
    console.error("[Cloning Expanded] Failed to register DNA Needle:", e);
    return false;
  }
}

function extractDNAFromCreature(ctx, creature) {
  const dnaInfo = dnaForCreature(creature);
  
  if (!dnaInfo) return null;
  if (creature.dnaExtracted) return null;
  
  creature.dnaExtracted = true;
  const creatureId = creature.id;
  const creatureType = creature.type;
  const creatureX = Math.floor(creature.x / 4);
  const creatureY = Math.floor(creature.y / 4) - 2;
  
  const collectedHandlers = ctx.sandkit.events["entity:collected"];
  
  const cleanupHandler = (state, data) => {
    if (!data || data.entityId !== creatureId || data.typeId !== creatureType) return;
    
    const creatureStore = state.store.creatures[data.typeId];
    if (creatureStore) {
      creatureStore.available = Math.max(0, creatureStore.available - 1);
    }
    
    setTimeout(() => {
      try {
        setTimeout(() => {
          const spawnOffsets = [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ];
          
          spawnOffsets.forEach(offset => {
            const spawnX = creatureX + offset.x;
            const spawnY = creatureY + offset.y;
            
            const existingElement = api.elements.getTypeAtCell(spawnX, spawnY);
            const terrainType = api.terrains.getTypeAtCell(spawnX, spawnY);

            if (terrainType === CELL_BLOCK) return;
            
            if (terrainType === CELL_SANDIUM_SOIL) {
              api.elements.replaceAtCellWhenIdle(spawnX, spawnY, dnaInfo.elementType);
            }
            if (existingElement === ELEMENT_WATER) {
              api.elements.replaceAtCellWhenIdle(spawnX, spawnY, dnaInfo.elementType);
            } else if (terrainType !== null && terrainType !== 0) {
              api.terrains.replaceAtCellWhenIdle(spawnX, spawnY, dnaInfo.elementType);
            } else if (existingElement !== null) {
              api.elements.replaceAtCellWhenIdle(spawnX, spawnY, dnaInfo.elementType);
            } else {
              api.elements.createAtCellWhenIdle(spawnX, spawnY, dnaInfo.elementType);
            }
          });
        }, 50);
        
      } catch (e) {
        console.warn("[Cloning Expanded] DNA placement failed:", e.message);
      }
    }, 50);
    
    if (collectedHandlers) {
      const index = collectedHandlers.indexOf(cleanupHandler);
      if (index !== -1) collectedHandlers.splice(index, 1);
    }
  };
  
  if (collectedHandlers) collectedHandlers.push(cleanupHandler);
  
  FH.entities.startCapture(ctx, creatureId);
  return dnaInfo;
}

// ==================== PLACEMENT COLLISION ====================

function isAreaClear(x, y, size) {
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      const checkX = x + dx;
      const checkY = y + dy;
      
      const structure = api.structures.getAtCell(checkX, checkY);
      if (structure != null) return false;
      
      const terrainType = api.terrains.getTypeAtCell(checkX, checkY);
      if (terrainType != null) return false;
      
      if (!api.authorization.canBuildAtCell(checkX, checkY)) return false;
    }
  }
  return true;
}

api.events.on("building:placed", (payload) => {
  if (payload?.structure?.type === CHAMBER_ID) {
    // duplication glitch fix
    api.structures.setData(payload.structure, { dnaType: null, progress: 0, working: false });
  }
});

window.addEventListener('mousedown', (e) => {
  const selectedAction = api.action.getSelected();
  
  if (selectedAction?.type === enums.ActionType.Building 
      && selectedAction.id === CHAMBER_ID) {
    
    const mousePos = api.input.getMouseCellPosition();
    
    if (mousePos) {
      const isClear = isAreaClear(mousePos.x, mousePos.y, BLOCK_WIDTH);
      
      if (!isClear) {
        //console.log(`Prevented placement at (${mousePos.x}, ${mousePos.y})`);
        api.ui.toast("Cannot place here - area is not clear!");
        
        api.building.cancelPlacement();
        
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
}, true);

// ==================== REGISTER CHAMBER ====================

api.structures.register({
  id: CHAMBER_ID,
  blockGridType: CHAMBER_ID,
  name: "Cloning Chamber",
  description: "Clones creatures from DNA samples using nutrient fluid.",
  categoryKey: "production",
  order: 10,
  alwaysUnlocked: false, // Changed to false - requires tech
  rejectWhenBlocked: true,
  buildModes: [{ type: "single" }],
  variants: [{ id: CHAMBER_ID, angles: [0] }],
  shape: [
    [1, 1, 0, 0, 1, 1, 0, 1],
    [1, 1, 0, 0, 1, 1, 1, 1],
    [1, 1, 0, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ],
  render: {
    imageName: CHAMBER_SPRITE_ID,
    size: { width: 32, height: 48 },
    ui: { outline: true },
  },
  draw: (e, structure, context) => {
    const ctx = context.ctx;
    const time = api.time.getTimeMs();
    
    const cellSize = api.rendering.getGridMetrics().cellSize;
    const drawPos = api.rendering.getDrawPositionAtCell(structure.x, structure.y);

    const dnaType = structure.data?.dnaType;
    const dnaInfo = DNA_TYPES.find(d => d.elementType === dnaType);

    if (structure.data?.dnaType !== null && dnaInfo) {
      const youngSprite = e.sandkit?.graphics?.[dnaInfo.sprite]?.imageAsset;
      if (youngSprite?.image) {
        const progress = structure.data?.progress || 0;
        const scale = Math.min(Math.max(progress / GROWTH_MAX, 0.1), 1.0);
        const centerX = drawPos.x + 16;
        const centerY = drawPos.y + 24 + Math.floor(time / YOUNG_ANIMATION_INTERVAL) % 2;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.drawImage(youngSprite.image, -8, -8, 16, 16);
        ctx.restore();
      }
    }
    
    const chamberSprite = e.sandkit?.graphics?.[CHAMBER_SPRITE_ID]?.imageAsset;
    if (chamberSprite?.image) {
      ctx.drawImage(chamberSprite.image, drawPos.x, drawPos.y, 32, 48);
    }
    
    const progress = structure.data?.progress || 0;
    const progressPercent = progress / GROWTH_MAX;
    
    const barX = drawPos.x + 8;
    const barY = drawPos.y + 43;
    const barWidth = 16;
    const barHeight = 2;
    
    if (progressPercent > 0) {
      ctx.fillStyle = "#55ff55";
      ctx.fillRect(barX, barY, barWidth * progressPercent, barHeight);
    }
    if (structure.data?.working === true) {
    ctx.fillStyle = "#55ff55";
    ctx.fillRect(drawPos.x + 3, drawPos.y + 3, 2, 2);
    }
  },
  defaultData: {
    enabled: true,
    progress: 0,
    working: false,
    dnaType: null,
  },
}, {
  useRawShape: true
});

// ==================== CHAMBER LOGIC ====================

function retileExistingChambers() {
  try {
    api.structures.forEachOfType(CHAMBER_ID, (structure) => {
      for (let dy = 0; dy < BLOCK_HEIGHT; dy++) {
        for (let dx = 0; dx < BLOCK_WIDTH; dx++) {
          const x = structure.x + dx;
          const y = structure.y + dy;
          let terrain = null;
          try {
            terrain = api.terrains.getTypeAtCell(x, y);
          } catch (error) {}
          if (terrain !== 45) continue;
          try {
            api.terrains.replaceAtCellWhenIdle(x, y, 1);
          } catch (error) {}
        }
      }
    });
  } catch (error) {}
}

function useDNAPellet(ctx, structure) {
  const cellX = structure.x + 6;
  const cellY = structure.y;
  
  const elementType = FH.elements.getElementTypeAtPos(ctx, cellX, cellY);
  
  for (const dna of DNA_TYPES) {
    if (elementType === dna.elementType) {
      // Remove pellet immediately - one pellet, one use
      FH.elements.removeAt(ctx, cellX, cellY);
      return dna.elementType;
    }
  }
  
  return null;
}

function consumeFluidFromChamber(ctx, structure) {
  for (let x = 3; x < 7; x++) {
    const cellX = structure.x + x;
    const cellY = structure.y + 3;
    const elementType = FH.elements.getElementTypeAtPos(ctx, cellX, cellY);
    
    if (elementType === nutrientFluidType) {
      FH.elements.removeAt(ctx, cellX, cellY);
      return true;
    }
  }
  return false;
}

api.triggers.register("cloningChamberTick", {
  interval: 1000,
  sequentialRuns: false,
  callback: () => {
    const ctx = sandkit.state;
    api.structures.forEachOfType(CHAMBER_ID, (structure) => {
      if (structure.data?.enabled === false) return;
      if (!api.structures.processing.isEnabledAt(structure.x, structure.y)) return;

      if (structure.data?.dnaType === null || structure.data?.dnaType === undefined) {
        const currentDNA = useDNAPellet(ctx, structure);
        if (currentDNA !== null) {
          api.structures.setData(structure, { dnaType: currentDNA });
        }
      } else {
        const didConsume = consumeFluidFromChamber(ctx, structure);
        const currentProgress = structure.data?.progress || 0;
        let newProgress = currentProgress;
        
        if (didConsume) {
          newProgress++;
          api.structures.setData(structure, { working: true });
        } else {
          api.structures.setData(structure, { working: false });
        }
        
        if (newProgress >= GROWTH_MAX) {
          const spawnX = structure.x * 4 + 16;
          const spawnY = structure.y * 4 + 52;

          const dnaType = structure.data?.dnaType;
          const dnaInfo = DNA_TYPES.find(d => d.elementType === dnaType);

          spawnCreature(ctx, dnaInfo?.creatureType || dnaInfo?.sprite, spawnX, spawnY);
          newProgress = 0;
          api.structures.setData(structure, { dnaType: null, progress: 0 });
        } else {
          api.structures.setData(structure, { progress: newProgress });
        }
      }
    });
  },
});

// ==================== UI ====================

function ChamberUI() {
  const [refresh, setRefresh] = react.useState(0);
  
  react.useEffect(() => {
    const interval = setInterval(() => setRefresh(v => v + 1), 500);
    return () => clearInterval(interval);
  }, []);
  
  const selectedAction = api.action.getSelected();
  const isVisible = selectedAction?.type === enums.ActionType.Building 
    && selectedAction.id === CHAMBER_ID;
  
  if (!isVisible) return null;
  
  return react.createElement(
    "div",
    {
      onMouseDown: (e) => e.stopPropagation(),
      style: {
        position: "fixed",
        left: "18px",
        bottom: "118px",
        width: "200px",
        padding: "10px",
        border: "2px solid #31566b",
        borderRadius: "5px",
        background: "rgba(5, 24, 34, 0.97)",
        color: "white",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.65)",
        fontFamily: "sans-serif",
        zIndex: 10000,
      },
    },
    react.createElement(
      "div",
      { style: { fontWeight: 700, marginBottom: "8px" } },
      "Cloning Chamber"
    ),
    react.createElement(
      "div",
      { style: { fontSize: "12px", color: "#aaa" } },
      "Clones critters from nutrient fluid. Requires a dna sample to clone a specific type."
    ),
  );
}

api.ui.inject("cloning-chamber-ui", ChamberUI);

// ==================== TECH TREE ====================

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
}

function addTechNode(id, parentId, name, description, cost, unlocks, position) {
  if (safe(() => api.tech.getDefinitionById(id))) return true;
  if (parentId === undefined || parentId === null) {
    console.error(`No parent tech for "${id}"`);
    return false;
  }

  safe(() =>
    api.i18n.register("en", {
      [`tech|${id}|name`]: name,
      [`tech|${id}|description`]: description,
    })
  );

  try {
    api.tech.registerNode(
      id,
      {
        nameKey: `tech|${id}|name`,
        descriptionKey: `tech|${id}|description`,
        cost: Math.max(0, cost),
        currencyType: "gold",
        branch: "heat",
        requires: [parentId],
        unlocks,
      },
      { 
        parentId,
        preferredPosition: position
      }
    );
    //console.log(`[Cloning Expanded] Tech node "${id}" registered under parent "${parentId}"!`);
    return true;
  } catch (e) {
    console.error(`Research node "${id}" failed:`, e);
    return false;
  }
}


let corrallerTechId = null;

//parent tech
if (sandkit.enums?.Tech?.Corraller) {
  corrallerTechId = sandkit.enums.Tech.Corraller;
  //console.log("[Cloning Expanded] Using Corraller tech ID from enums:", corrallerTechId);
}

if (corrallerTechId) {
  const swabTech = addTechNode(
    "dnaSwabTech",
    corrallerTechId,
    "DNA Extraction",
    "Unlocks the DNA Swab for extracting DNA from creatures.",
    1500,
    { 
      items: [SYRINGE_ID]
    },
    { row: 11, col: 6 }
  );
  
  const chamberTech = addTechNode(
    "cloningChamberTech",
    corrallerTechId,
    "Cloning Technology",
    "Unlocks the Cloning Chamber for cloning creatures from DNA samples.",
    3000,
    { 
      structures: [CHAMBER_ID]
    },
    { row: 9, col: 6 }
  );
  
  if (swabTech && chamberTech) {
    //console.log("[Cloning Expanded] Tech tree integration successful!");
  }
} else {
  console.warn("[Cloning Expanded] Could not find Corraller tech - keeping everything unlocked");
  api.player.buildings.unlockByType(CHAMBER_ID);
}

// ==================== INITIALIZE ====================

async function initialize() {
  console.log("[Cloning Expanded] Starting...");
  
  resolveCreatureIds();
  registerNutrientFluidShader();
  
  registerNutrientFluid();
  
  for (const dna of DNA_TYPES) {
    registerDNAPellet(dna);
  }
  
  registerReaction();
  
  await loadImage(CHAMBER_SPRITE_ID);
  await loadImage(SYRINGE_SPRITE_ID);
  
  registerDNANeedle();
  
  console.log("[Cloning Expanded] loaded");
}

initialize().catch(e => console.error("[Cloning Expanded] Init failed:", e));

try {
  api.events.on("game:ready", () => {
    resolveCreatureIds();
    retileExistingChambers();
  });
} catch (error) {}