import { START_TILE_OPTIONS, type Tile, type TileId, type TileType } from "@monopoly/shared";
import { propertyGroupByTileId } from "./propertyGroups";

export const START_SALARY = 1500;
export const START_TILE_IDS: readonly TileId[] = START_TILE_OPTIONS.map((option) => option.tileId);

interface TileDefinition {
  id: TileId;
  index: number;
  type: TileType;
  name: string;
  shortName: string;
  x: number;
  y: number;
  next: TileId[];
  price?: number;
  taxAmount?: number;
  description?: string;
  routeType?: Tile["routeType"];
  visualGroup?: string;
  orientation?: Tile["orientation"];
  directionLabels?: Record<TileId, string>;
}

const propertyMeta: Record<string, { color: string; basePrice: number }> = {
  star_moon_creative: { color: "sky", basePrice: 980 },
  cloud_plaza_street: { color: "orange", basePrice: 1180 },
  central_fun_street: { color: "green", basePrice: 1360 },
  sea_resort: { color: "blue", basePrice: 1480 },
  south_style_street: { color: "pink", basePrice: 1280 },
  lower_canal_street: { color: "red", basePrice: 1220 },
  west_living_area: { color: "gold", basePrice: 1120 },
  canal_snack_street: { color: "mint", basePrice: 1080 },
  east_port_business: { color: "purple", basePrice: 1580 }
};

const portalIds: TileId[] = ["tile-48", "tile-61"];

const d = (
  index: number,
  id: TileId,
  type: TileType,
  name: string,
  shortName: string,
  x: number,
  y: number,
  next: TileId[],
  options: Omit<TileDefinition, "index" | "id" | "type" | "name" | "shortName" | "x" | "y" | "next"> = {}
): TileDefinition => ({ index, id, type, name, shortName, x, y, next, ...options });

const definitions: TileDefinition[] = [
  d(0, "tile-00", "start", "左上 GO 起点", "GO", 375, 260, ["tile-01", "tile-26"], {
    routeType: "inner",
    visualGroup: "inner-corner",
    orientation: "center",
    description: "统一奖励点。所有玩家经过这里时获得一圈奖励；默认顺时针前进，系统会在这里决定继续内圈或进入上方扩展。",
    directionLabels: {
      "tile-01": "沿内圈向右",
      "tile-26": "进入上方扩展"
    }
  }),
  d(1, "tile-01", "property", "文具小铺", "文具", 425, 260, ["tile-02"], { routeType: "inner", visualGroup: "inner-top", orientation: "center" }),
  d(2, "tile-02", "stock", "中央股市牌", "股市", 475, 260, ["tile-03"], { routeType: "inner", visualGroup: "inner-top", orientation: "center" }),
  d(3, "tile-03", "property", "星月书屋", "书屋", 525, 260, ["tile-04"], { routeType: "inner", visualGroup: "inner-top", orientation: "center" }),
  d(4, "tile-04", "property", "星月画室", "画室", 575, 260, ["tile-05"], { routeType: "inner", visualGroup: "inner-top", orientation: "center" }),
  d(5, "tile-05", "choice_junction", "右上路口", "路口", 625, 260, ["tile-06", "tile-55"], {
    routeType: "inner",
    visualGroup: "inner-corner",
    orientation: "center",
    description: "共享右上角。系统会决定继续内圈向下或进入右侧扩展。",
    directionLabels: {
      "tile-06": "沿内圈向下",
      "tile-55": "进入右侧扩展"
    }
  }),
  d(6, "tile-06", "property", "中央海鲜铺", "海鲜", 625, 310, ["tile-07"], { routeType: "inner", visualGroup: "inner-right", orientation: "center" }),
  d(7, "tile-07", "bank", "中央银行柜台", "银行", 625, 360, ["tile-08"], { routeType: "inner", visualGroup: "inner-right", orientation: "center" }),
  d(8, "tile-08", "property", "中央航运馆", "航运", 625, 410, ["tile-09"], { routeType: "inner", visualGroup: "inner-right", orientation: "center" }),
  d(9, "tile-09", "choice_junction", "右下路口", "路口", 625, 460, ["tile-10", "tile-39"], {
    routeType: "inner",
    visualGroup: "inner-corner",
    orientation: "center",
    description: "共享右下角。系统会决定继续内圈向左或进入下方扩展。",
    directionLabels: {
      "tile-10": "沿内圈向左",
      "tile-39": "进入下方扩展"
    }
  }),
  d(10, "tile-10", "property", "海风冰点屋", "冰点", 575, 460, ["tile-11"], { routeType: "inner", visualGroup: "inner-bottom", orientation: "center" }),
  d(11, "tile-11", "skillShop", "海风技能铺", "技能", 525, 460, ["tile-12"], { routeType: "inner", visualGroup: "inner-bottom", orientation: "center" }),
  d(12, "tile-12", "property", "海风旅馆", "旅馆", 475, 460, ["tile-13"], { routeType: "inner", visualGroup: "inner-bottom", orientation: "center" }),
  d(13, "tile-13", "chance", "好运气球", "好运", 425, 460, ["tile-14"], { routeType: "inner", visualGroup: "inner-bottom", orientation: "center" }),
  d(14, "tile-14", "choice_junction", "左下路口", "路口", 375, 460, ["tile-15", "tile-54"], {
    routeType: "inner",
    visualGroup: "inner-corner",
    orientation: "center",
    description: "共享左下角。系统会决定继续内圈向上或进入左侧扩展。",
    directionLabels: {
      "tile-15": "沿内圈向上",
      "tile-54": "进入左侧扩展"
    }
  }),
  d(15, "tile-15", "property", "南门潮鞋店", "潮鞋", 375, 410, ["tile-16"], { routeType: "inner", visualGroup: "inner-left", orientation: "center" }),
  d(16, "tile-16", "skillShop", "技能卡屋", "技能", 375, 360, ["tile-17"], { routeType: "inner", visualGroup: "inner-left", orientation: "center" }),
  d(17, "tile-17", "property", "南门服饰屋", "服饰", 375, 310, ["tile-00"], { routeType: "inner", visualGroup: "inner-left", orientation: "center" }),

  d(18, "tile-18", "reward", "上方补给站", "补给", 375, 60, ["tile-19"], { routeType: "outer", visualGroup: "upper-top", orientation: "north" }),
  d(19, "tile-19", "property", "星月文创馆", "文创", 425, 60, ["tile-20"], { routeType: "outer", visualGroup: "upper-top", orientation: "north" }),
  d(20, "tile-20", "draw_card", "星愿抽卡亭", "抽卡", 475, 60, ["tile-21"], { routeType: "outer", visualGroup: "upper-top", orientation: "north" }),
  d(21, "tile-21", "lottery", "云顶彩票屋", "彩票", 525, 60, ["tile-22"], { routeType: "outer", visualGroup: "upper-top", orientation: "north" }),
  d(22, "tile-22", "property", "星月剧场", "剧场", 575, 60, ["tile-23"], { routeType: "outer", visualGroup: "upper-top", orientation: "north" }),
  d(23, "tile-23", "chance", "星光好运牌", "好运", 625, 60, ["tile-27"], { routeType: "outer", visualGroup: "upper-top", orientation: "north" }),
  d(24, "tile-24", "go_jail", "入狱警示格", "入狱", 375, 110, ["tile-18"], {
    routeType: "outer",
    visualGroup: "upper-left",
    orientation: "north",
    description: "踩到后会被送往监狱支路。"
  }),
  d(25, "tile-25", "tax", "云顶维护税", "税收", 375, 160, ["tile-24"], { routeType: "outer", visualGroup: "upper-left", orientation: "north", taxAmount: 850 }),
  d(26, "tile-26", "property", "云朵花坊", "花坊", 375, 210, ["tile-25"], { routeType: "outer", visualGroup: "upper-left", orientation: "north" }),
  d(27, "tile-27", "property", "云端工坊", "工坊", 625, 110, ["tile-28"], { routeType: "outer", visualGroup: "upper-right", orientation: "north" }),
  d(28, "tile-28", "stock", "云端股市厅", "股市", 625, 160, ["tile-29"], { routeType: "outer", visualGroup: "upper-right", orientation: "north" }),
  d(29, "tile-29", "property", "云端咖啡馆", "咖啡", 625, 210, ["tile-05"], { routeType: "outer", visualGroup: "upper-right", orientation: "north" }),

  d(30, "tile-30", "property", "下城旅馆", "旅馆", 375, 660, ["tile-38"], { routeType: "outer", visualGroup: "lower-bottom", orientation: "south" }),
  d(31, "tile-31", "lottery", "南门彩票店", "彩票", 425, 660, ["tile-30"], { routeType: "outer", visualGroup: "lower-bottom", orientation: "south" }),
  d(32, "tile-32", "property", "南门饰品店", "饰品", 475, 660, ["tile-31"], { routeType: "outer", visualGroup: "lower-bottom", orientation: "south" }),
  d(33, "tile-33", "arcade", "南门游乐摊", "游乐", 525, 660, ["tile-32"], { routeType: "outer", visualGroup: "lower-bottom", orientation: "south" }),
  d(34, "tile-34", "property", "南门服饰店", "服饰", 575, 660, ["tile-33"], { routeType: "outer", visualGroup: "lower-bottom", orientation: "south" }),
  d(35, "tile-35", "reward", "康复出口", "康复", 625, 660, ["tile-34"], { routeType: "outer", visualGroup: "lower-bottom", orientation: "south" }),
  d(36, "tile-36", "property", "运河茶摊", "茶摊", 375, 510, ["tile-14"], { routeType: "outer", visualGroup: "lower-left", orientation: "south" }),
  d(37, "tile-37", "chance", "下城好运牌", "好运", 375, 560, ["tile-36"], { routeType: "outer", visualGroup: "lower-left", orientation: "south" }),
  d(38, "tile-38", "property", "运河糖铺", "糖铺", 375, 610, ["tile-37"], { routeType: "outer", visualGroup: "lower-left", orientation: "south" }),
  d(39, "tile-39", "bank", "下城银行", "银行", 625, 510, ["tile-40"], { routeType: "outer", visualGroup: "lower-right", orientation: "south" }),
  d(40, "tile-40", "property", "运河书摊", "书摊", 625, 560, ["tile-41"], { routeType: "outer", visualGroup: "lower-right", orientation: "south" }),
  d(41, "tile-41", "hospital_entry", "医院入口格", "入院", 625, 610, ["tile-35"], {
    routeType: "outer",
    visualGroup: "lower-right",
    orientation: "south",
    description: "踩到后会被送往医院支路。"
  }),

  d(42, "tile-42", "property", "西风花店", "花店", 125, 260, ["tile-43"], { routeType: "outer", visualGroup: "left-top", orientation: "west" }),
  d(43, "tile-43", "misfortune", "西风乌云牌", "厄运", 175, 260, ["tile-44"], { routeType: "outer", visualGroup: "left-top", orientation: "west" }),
  d(44, "tile-44", "property", "西风家居馆", "家居", 225, 260, ["tile-45"], { routeType: "outer", visualGroup: "left-top", orientation: "west" }),
  d(45, "tile-45", "stock", "西风股市角", "股市", 275, 260, ["tile-46"], { routeType: "outer", visualGroup: "left-top", orientation: "west" }),
  d(46, "tile-46", "property", "西风咖啡铺", "咖啡", 325, 260, ["tile-00"], { routeType: "outer", visualGroup: "left-top", orientation: "west" }),
  d(47, "tile-47", "tax", "西风服务税", "税收", 125, 310, ["tile-42"], { routeType: "outer", visualGroup: "left-side", orientation: "west", taxAmount: 780 }),
  d(48, "tile-48", "teleport", "传送门 B", "门B", 125, 360, ["tile-47"], {
    routeType: "outer",
    visualGroup: "portal",
    orientation: "west",
    description: "传送门 B 位于左侧中心，只会连接到右侧中心的传送门 A。"
  }),
  d(49, "tile-49", "chance", "西风好运灯", "好运", 125, 410, ["tile-48"], { routeType: "outer", visualGroup: "left-side", orientation: "west" }),
  d(50, "tile-50", "plaza", "西风广场", "广场", 125, 460, ["tile-49"], { routeType: "outer", visualGroup: "left-bottom", orientation: "west" }),
  d(51, "tile-51", "skillShop", "运河技能铺", "技能", 175, 460, ["tile-50"], { routeType: "outer", visualGroup: "left-bottom", orientation: "west" }),
  d(52, "tile-52", "property", "运河茶铺", "茶铺", 225, 460, ["tile-51"], { routeType: "outer", visualGroup: "left-bottom", orientation: "west" }),
  d(53, "tile-53", "property", "运河糖铺", "糖铺", 275, 460, ["tile-52"], { routeType: "outer", visualGroup: "left-bottom", orientation: "west" }),
  d(54, "tile-54", "property", "运河书铺", "书铺", 325, 460, ["tile-53"], { routeType: "outer", visualGroup: "left-bottom", orientation: "west" }),

  d(55, "tile-55", "property", "东港海鲜铺", "海鲜", 675, 260, ["tile-56"], { routeType: "outer", visualGroup: "right-top", orientation: "east" }),
  d(56, "tile-56", "stock", "东港股市牌", "股市", 725, 260, ["tile-57"], { routeType: "outer", visualGroup: "right-top", orientation: "east" }),
  d(57, "tile-57", "property", "东港旅店", "旅店", 775, 260, ["tile-58"], { routeType: "outer", visualGroup: "right-top", orientation: "east" }),
  d(58, "tile-58", "chance", "东港好运牌", "好运", 825, 260, ["tile-59"], { routeType: "outer", visualGroup: "right-top", orientation: "east" }),
  d(59, "tile-59", "property", "东港工艺铺", "工艺", 875, 260, ["tile-60"], { routeType: "outer", visualGroup: "right-top", orientation: "east" }),
  d(60, "tile-60", "property", "东港航运馆", "航运", 875, 310, ["tile-61"], { routeType: "outer", visualGroup: "right-side", orientation: "east" }),
  d(61, "tile-61", "teleport", "传送门 A", "门A", 875, 360, ["tile-62"], {
    routeType: "outer",
    visualGroup: "portal",
    orientation: "east",
    description: "传送门 A 位于右侧中心，只会连接到左侧中心的传送门 B。"
  }),
  d(62, "tile-62", "property", "海风温泉馆", "温泉", 875, 410, ["tile-63"], { routeType: "outer", visualGroup: "right-side", orientation: "east" }),
  d(63, "tile-63", "misfortune", "东港乌云牌", "厄运", 875, 460, ["tile-64"], { routeType: "outer", visualGroup: "right-bottom", orientation: "east" }),
  d(64, "tile-64", "property", "彩虹剧院", "剧院", 825, 460, ["tile-65"], { routeType: "outer", visualGroup: "right-bottom", orientation: "east" }),
  d(65, "tile-65", "skillShop", "彩虹技能铺", "技能", 775, 460, ["tile-66"], { routeType: "outer", visualGroup: "right-bottom", orientation: "east" }),
  d(66, "tile-66", "property", "彩虹玩具店", "玩具", 725, 460, ["tile-67"], { routeType: "outer", visualGroup: "right-bottom", orientation: "east" }),
  d(67, "tile-67", "property", "彩虹能源屋", "能源", 675, 460, ["tile-09"], { routeType: "outer", visualGroup: "right-bottom", orientation: "east" }),

  d(68, "jail-00", "reward", "出狱补给箱", "补给", 325, 60, ["tile-18"], { routeType: "detention", visualGroup: "jail-branch", orientation: "west" }),
  d(69, "jail-01", "chance", "监狱好运牌", "好运", 275, 60, ["jail-00"], { routeType: "detention", visualGroup: "jail-branch", orientation: "west" }),
  d(70, "jail-02", "reward", "保释彩券箱", "彩券", 225, 60, ["jail-01"], { routeType: "detention", visualGroup: "jail-branch", orientation: "west" }),
  d(71, "jail-03", "draw_card", "监狱抽卡箱", "抽卡", 175, 60, ["jail-02"], { routeType: "detention", visualGroup: "jail-branch", orientation: "west" }),
  d(72, "jail-04", "reward", "出狱金币袋", "金币", 125, 60, ["jail-03"], { routeType: "detention", visualGroup: "jail-branch", orientation: "west" }),
  d(73, "jail-05", "jail", "泡泡监狱", "监狱", 75, 60, ["jail-04"], {
    routeType: "detention",
    visualGroup: "jail-branch",
    orientation: "west",
    description: "监狱本体不在主路上，只有入狱格和惩罚效果会把玩家送来。"
  }),

  d(74, "hospital-00", "reward", "出院补给箱", "补给", 675, 660, ["tile-35"], { routeType: "detention", visualGroup: "hospital-branch", orientation: "east" }),
  d(75, "hospital-01", "chance", "康复好运牌", "好运", 725, 660, ["hospital-00"], { routeType: "detention", visualGroup: "hospital-branch", orientation: "east" }),
  d(76, "hospital-02", "reward", "医院彩券箱", "彩券", 775, 660, ["hospital-01"], { routeType: "detention", visualGroup: "hospital-branch", orientation: "east" }),
  d(77, "hospital-03", "draw_card", "护士抽卡箱", "抽卡", 825, 660, ["hospital-02"], { routeType: "detention", visualGroup: "hospital-branch", orientation: "east" }),
  d(78, "hospital-04", "reward", "康复糖果", "康复", 875, 660, ["hospital-03"], { routeType: "detention", visualGroup: "hospital-branch", orientation: "east" }),
  d(79, "hospital-05", "hospital", "棉花糖医院", "医院", 925, 660, ["hospital-04"], {
    routeType: "detention",
    visualGroup: "hospital-branch",
    orientation: "east",
    description: "医院本体不在主路上，只有医院格、导弹卡或惩罚事件会把玩家送来。"
  })
];

function regionFor(definition: TileDefinition): string {
  if (definition.visualGroup === "jail-branch") return "监狱支路";
  if (definition.visualGroup === "hospital-branch") return "医院支路";
  if (definition.visualGroup?.startsWith("upper")) return "上方扩展区";
  if (definition.visualGroup?.startsWith("lower")) return "下方扩展区";
  if (definition.visualGroup?.startsWith("left")) return "左侧扩展区";
  if (definition.visualGroup?.startsWith("right")) return "右侧扩展区";
  if (definition.visualGroup === "portal") return "传送门";
  if (definition.routeType === "inner") return "中央内圈";
  return "奇趣财富岛";
}

function createTile(definition: TileDefinition): Tile {
  const groupId = propertyGroupByTileId[definition.id];
  const groupMeta = groupId ? propertyMeta[groupId] : undefined;
  const price = definition.price ?? (groupMeta ? groupMeta.basePrice + (definition.index % 8) * 45 : undefined);
  const baseRent = price ? Math.round(price * 0.12) : undefined;
  const portalOptions =
    definition.type === "teleport"
      ? portalIds
          .filter((portalId) => portalId !== definition.id)
          .map((portalId) => {
            const target = definitions.find((item) => item.id === portalId);
            return {
              targetTileId: portalId,
              label: target?.name ?? portalId,
              costTickets: 0
            };
          })
      : undefined;

  return {
    id: definition.id,
    index: definition.index,
    name: definition.name,
    shortName: definition.shortName,
    type: definition.type,
    price,
    baseRent,
    rentBase: baseRent,
    colorGroup: groupMeta?.color,
    groupId,
    taxAmount: definition.taxAmount,
    portalOptions,
    portalCostTickets: definition.type === "teleport" ? 0 : undefined,
    position: { x: definition.x, y: definition.y },
    next: definition.next,
    directionLabels: definition.directionLabels,
    region: regionFor(definition),
    description: definition.description,
    routeType: definition.routeType,
    visualGroup: definition.visualGroup,
    orientation: definition.orientation
  };
}

export const mapTiles: Tile[] = definitions.map(createTile);
