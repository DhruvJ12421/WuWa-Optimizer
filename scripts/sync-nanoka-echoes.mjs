import { writeFile } from 'node:fs/promises'
const version='3.5',base=`https://static.nanoka.cc/ww/${version}`
const sources={characters:`${base}/character.json`,weapons:`${base}/weapon.json`,echoes:`${base}/echo.json`}
const names=['','Freezing Frost','Molten Rift','Void Thunder','Sierra Gale','Celestial Light','Havoc Eclipse','Rejuvenating Glow','Moonlit Clouds','Lingering Tunes','Frosty Resolve','Eternal Radiance','Midnight Veil','Empyrean Anthem','Tidebreaking Courage',,'Gusts of Welkin','Windward Pilgrimage','Flaming Clawprint','Dream of the Lost','Crown of Valor','Law of Harmony',"Flamewing's Shadow",'Thread of Severed Fate','Pact of Neonlight Leap','Halo of Starry Radiance','Rite of Gilded Revelation','Trailblazing Star','Chromatic Foam','Sound of True Name','Wishes of Quiet Snowfall','Reel of Spliced Memories','Shadow of Shattered Dreams','Song of Feathered Trace',"Heart of Evil's Purge",'Lamp of Nether Road']
const load=async source=>{const response=await fetch(source);if(!response.ok)throw Error(`Nanoka ${response.status}: ${source}`);return response.json()}
const mapLimit=async(items,limit,mapper)=>{
  const output=new Array(items.length)
  let cursor=0
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(cursor<items.length){const index=cursor++;output[index]=await mapper(items[index],index)}
  }))
  return output
}
const [rawCharacters,rawWeapons,rawEchoes]=await Promise.all(Object.values(sources).map(load))
const formatEffect=(desc='',param=[])=>desc.replace(/\{(\d+)\}/g,(_,index)=>param[Number(index)]??`{${index}}`)
const asset=p=>`https://static.nanoka.cc/assets/ww/${p.replace(/^\/Game\/Aki\/UI\//,'').split('.')[0]}.webp`
const elements=['','Glacio','Fusion','Electro','Aero','Spectro','Havoc']
const weaponTypes=['','Broadblade','Sword','Pistols','Gauntlets','Rectifier']
const characterDetails=await mapLimit(Object.keys(rawCharacters),8,async id=>[id,await load(`${base}/en/character/${id}.json`)])
const characterDetailById=new Map(characterDetails)
const combatType=skillType=>skillType==='Normal Attack'?'basic':skillType==='Resonance Liberation'?'liberation':'skill'
const skillLevelIndex=skillType=>skillType==='Normal Attack'?0:skillType==='Resonance Skill'?1:skillType==='Forte Circuit'?2:skillType==='Resonance Liberation'?3:skillType==='Intro Skill'?4:1
const characters=Object.entries(rawCharacters).map(([id,c])=>{
  const detail=characterDetailById.get(id),maxStats=detail?.stats?.['6']?.['90']??{}
  const attacks=Object.entries(detail?.skill_trees??{}).flatMap(([nodeId,node])=>{
    const skill=node.skill??node
    const levelLines=Object.values(skill.level??{})
    return Object.values(skill.damage??{}).flatMap((damage,index)=>{
      const multipliers=(damage.rate_lv??[]).map(value=>Number(value)/10000)
      if(!multipliers.length||!['ATK','HP'].includes(damage.related_property))return []
      const line=levelLines[index]
      const name=line?.name?`${skill.name} - ${line.name}`:skill.name
      const isHealing=Number(damage.element)===0
      const type=isHealing?'healing':/heavy attack/i.test(name)?'heavy':combatType(skill.type)
      return [{id:`${id}-${nodeId}-${index}`,name,type,skillLevelIndex:skillLevelIndex(skill.type),scalesWith:damage.related_property.toLowerCase(),multipliers}]
    })
  })
  return {id,name:c.en,title:detail?.chara_info?.talent_name??c.nickname??c.en,nickname:c.nickname,description:c.desc.replace(/<[^>]+>/g,''),rarity:c.rank,element:elements[c.element]??'Unknown',weaponType:weaponTypes[c.weapon]??'Unknown',role:Object.values(detail?.tag??{})[0]?.name??'Resonator',baseStats:{hp:Number(maxStats.life??0),atk:Number(maxStats.atk??0),def:Number(maxStats.def??0),critRate:5,critDamage:150},attacks,articleUrl:`https://ww.nanoka.cc/character/${id}`,iconSourceUrl:asset(c.icon),portraitSourceUrl:asset(detail?.background_stand??detail?.background??c.icon)}
}).sort((a,b)=>a.name.localeCompare(b.name))
const weaponEntries=Object.entries(rawWeapons).filter(([,weapon])=>!/^Projection(?:\s*[-:]|\b)/i.test(weapon.en))
const weaponDetails=await mapLimit(weaponEntries.map(([id])=>id),8,async id=>[id,await load(`${base}/en/weapon/${id}.json`)])
const weaponDetailById=new Map(weaponDetails)
const weaponLevels=[1,10,20,30,40,50,60,70,80,90]
const formatWeaponStat=stat=>{
  if(!stat)return ''
  const value=stat.is_percent?stat.value/100:stat.is_ratio?stat.value*100:stat.value
  return `${value.toFixed(1).replace(/\.0$/,'')}${stat.is_percent||stat.is_ratio?'%':''}`
}
const weapons=weaponEntries.map(([id,w])=>{
  const detail=weaponDetailById.get(id),maxStats=detail?.stats?.['6']?.['90']??[]
  const secondary=maxStats[1]
  const levelStats=weaponLevels.map(level=>{
    const candidates=Object.entries(detail?.stats??{}).flatMap(([ascension,levels])=>levels[String(level)]?[{ascension:Number(ascension),stats:levels[String(level)]}]:[]).sort((a,b)=>b.ascension-a.ascension)
    const stats=candidates[0]?.stats??[]
    return {level,baseAtk:Math.round(stats[0]?.value??0),secondaryStatValue:formatWeaponStat(stats[1])}
  })
  const passiveEffects=Array.from({length:5},(_,rank)=>formatEffect(detail?.effect,(detail?.param??[]).map(values=>values[rank])))
  return {id,name:w.en,description:w.desc,rarity:w.rank,type:weaponTypes[w.type]??'Unknown',baseAtk:Math.round(maxStats[0]?.value??w.atk??0),secondaryStat:w.sub??secondary?.name??'Unreleased',secondaryStatValue:formatWeaponStat(secondary),levelStats,passiveName:detail?.effect_name??'',passiveEffects,articleUrl:`https://ww.nanoka.cc/weapon/${id}`,iconSourceUrl:asset(w.icon)}
}).sort((a,b)=>a.name.localeCompare(b.name))
const echoes=Object.entries(rawEchoes).map(([id,e])=>({id,name:e.en,cost:e.intensity===0?1:e.intensity===1?3:4,sonatas:e.group.map(g=>names[g]),rarities:e.rank,intensity:e.intensity,articleUrl:`https://ww.nanoka.cc/echo/${id}`,iconPath:e.icon,iconSourceUrl:asset(e.icon)})).sort((a,b)=>a.name.localeCompare(b.name))
if(echoes.length<170||echoes.some(e=>e.sonatas.includes(undefined)))throw Error('Incomplete Nanoka data')
const representativeEchoByGroup=new Map()
for(const [echoId,echo] of Object.entries(rawEchoes))for(const groupId of echo.group)if(!representativeEchoByGroup.has(groupId))representativeEchoByGroup.set(groupId,echoId)
const groupDetails=await Promise.all([...representativeEchoByGroup.entries()].map(async([groupId,echoId])=>{const detail=await load(`${base}/en/echo/${echoId}.json`);return [groupId,detail.group?.[groupId]]}))
const groupById=new Map(groupDetails)
const sonatas=names.flatMap((name,id)=>name?[{id:String(id),name,echoCount:echoes.filter(e=>e.sonatas.includes(name)).length,effects:Object.entries(groupById.get(id)?.set??{}).map(([pieces,effect])=>({pieces:Number(pieces),description:formatEffect(effect.desc,effect.param)})).sort((a,b)=>a.pieces-b.pieces)}]:[])
const sonataIconSources=Object.fromEntries(sonatas.map(sonata=>[sonata.name,groupById.get(Number(sonata.id))?.icon?asset(groupById.get(Number(sonata.id)).icon):'']))
if(characters.length<50||weapons.length<100||sonatas.length<30)throw Error('Incomplete Nanoka catalogs')
const generatedAt=new Date().toISOString(),body=`// Generated by scripts/sync-nanoka-echoes.mjs. Do not edit.\nexport interface GeneratedCharacterAttackEntry {id:string;name:string;type:'basic'|'heavy'|'skill'|'liberation'|'healing';skillLevelIndex:number;scalesWith:'atk'|'hp';multipliers:number[]}\nexport interface GeneratedCharacterCatalogEntry {id:string;name:string;title:string;nickname:string;description:string;rarity:number;element:string;weaponType:string;role:string;baseStats:{hp:number;atk:number;def:number;critRate:number;critDamage:number};attacks:GeneratedCharacterAttackEntry[];articleUrl:string;iconSourceUrl:string;portraitSourceUrl:string}\nexport interface GeneratedWeaponLevelStats {level:number;baseAtk:number;secondaryStatValue:string}\nexport interface GeneratedWeaponCatalogEntry {id:string;name:string;description:string;rarity:number;type:string;baseAtk:number;secondaryStat:string;secondaryStatValue:string;levelStats:GeneratedWeaponLevelStats[];passiveName:string;passiveEffects:string[];articleUrl:string;iconSourceUrl:string}\nexport interface GeneratedSonataCatalogEntry {id:string;name:string;echoCount:number;effects:Array<{pieces:number;description:string}>}\nexport interface GeneratedEchoCatalogEntry {id:string;name:string;cost:1|3|4;sonatas:string[];rarities:number[];intensity:number;articleUrl:string;iconPath:string;iconSourceUrl:string}\nexport const generatedCharacterCatalog:GeneratedCharacterCatalogEntry[]=${JSON.stringify(characters,null,2)}\nexport const generatedWeaponCatalog:GeneratedWeaponCatalogEntry[]=${JSON.stringify(weapons,null,2)}\nexport const generatedSonataCatalog:GeneratedSonataCatalogEntry[]=${JSON.stringify(sonatas,null,2)}\nexport const generatedEchoCatalog:GeneratedEchoCatalogEntry[]=${JSON.stringify(echoes,null,2)}\nexport const catalogProvenance=${JSON.stringify({sources,dataVersion:version,generatedAt})} as const\n`
await writeFile('src/game-data/catalog.generated.ts',`${body}export const generatedSonataIconSources:Record<string,string>=${JSON.stringify(sonataIconSources,null,2)}\n`)
await writeFile('src/game-data/echoes.generated.ts',`// Compatibility export. Generated catalog lives in catalog.generated.ts.\nexport { generatedEchoCatalog, catalogProvenance as echoCatalogProvenance } from './catalog.generated'\nexport type { GeneratedEchoCatalogEntry } from './catalog.generated'\n`)
console.log(`Wrote ${characters.length} characters, ${weapons.length} weapons, ${sonatas.length} Sonatas, and ${echoes.length} Echoes from Nanoka ${version}`)
