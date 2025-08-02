import { AnyString } from "@zwa73/utils";


type Pos = number;
type BoneIndex = number;
type VerticeTuple<I extends number,TMP extends unknown[] = [],ITER extends unknown[] = []> =
    ITER['length'] extends I ? TMP
        : VerticeTuple<I,[...(
                [...TMP,1,BoneIndex,Pos,Pos,Pos]|
                [...TMP,2,BoneIndex,Pos,Pos,Pos,BoneIndex,Pos,Pos,Pos]|
                [...TMP,3,BoneIndex,Pos,Pos,Pos,BoneIndex,Pos,Pos,Pos,BoneIndex,Pos,Pos,Pos]
            )],[1,...ITER]>


type BoneID = string;
type SlotID = string;
type AttaID = string;
type TransID = string;
type IkID = string;
/**路劲约束ID */
type PathID = string;

/**Spine骨骼单元的json输出格式 */
export type SpineBone = {
    name: BoneID;
    parent?: BoneID;
    rotation?: number;
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    /**描述继承关系的文本 */
    transform?: AnyString|"noRotationOrReflection"|"noScaleOrReflection"|"noScale"|"onlyTranslation";
};

/**Spine的skin单元输出格式 */
export type SpineSkin = {
    name: string;
    attachments: {
        [slot_id: SlotID]: {
            [attachment_id: AttaID]:SpineAttr;
        };
    };
}

/**Spine附件单元的json输出格式 */
export type SpineAttr = {
    type: "mesh";
    /**图片文件路径 renameattr依然可能出错 */
    path: AttaID;
    uvs: number[];
    triangles: number[];
    /**VerticeTuple
     * 多边形点组
     * 第一个值 x 为点数
     * 随后 x*4 个值分别为每个点的[骨骼下标, 坐标, 坐标, 坐标]
     * 以上结构循环拼接组成
     * 以浮点开头或是 长度==8 时可能为缺省点数下标写法
     */
    vertices: number[];
    hull: number;
    edges: number[];
    width: number;
    height: number;
} | {
    type: "path";
    lengths: number[];
    vertexCount: number;
    /**VerticeTuple
     * 多边形点组
     * 第一个值 x 为点数
     * 随后 x*3 个值分别为每个点的[骨骼下标, 坐标, 坐标, 坐标]
     * 以上结构循环拼接组成
     * 以浮点开头或是 长度==8 时可能为缺省点数下标写法
     */
    vertices: number[];
} | {
    x: number;
    y: number;
    rotation: number;
    width: number;
    height: number;
} | {
    type: "linkedmesh";
    parent: BoneID;
    width: number;
    height: number;
} | {
    type: "clipping",
    /**结束插槽 为自身则视为以上全部 */
    end: SlotID;
    /**点数 */
    vertexCount: number;
    /**点坐标组 [x1,y1,x2,y2...] */
    vertices: number[];
    color: string;
};

/**Spine插槽单元的json输出格式 */
export type SpineSlot = {
    name: SlotID;
    bone: BoneID;
    /**RGBA颜色 RRGGBBAA */
    color?:string;
    attachment?: AttaID|null;
}

/**Spine的json输出格式 */
export type SpineJson = {
    skeleton: {
        hash: string;
        spine: "3.8.75";
        images: string;
        audio: string;
    };
    bones?: SpineBone[];
    slots?: SpineSlot[];
    ik?: {
        name: IkID;
        bones: BoneID[];
        target: BoneID;
        order?:number;
    }[];
    transform?: {
        name: TransID;
        order?: number;
        bones: BoneID[];
        target: BoneID;
        x: number;
        y: number;
        rotateMix: number;
        translateMix: number;
        scaleMix: number;
        shearMix: number;
    }[];
    skins: SpineSkin[];
    animations?: {
        [anim_id: string]: {
            slots?: {
                [slot_id: SlotID]: {
                    color?: {
                        time?: number;
                        color: string;
                        curve: number;
                        c2: number;
                        c3: number;
                        c4: number;
                    }[];
                    attachment?: {
                        time?: number;
                        name: AttaID|null;
                    }[];
                };
            };
            bones?: {
                [bone_id:BoneID]: {
                    rotate?: {
                        time?: number;
                        angle: number;
                        curve: number;
                        c3: number;
                    }[];
                    scale?:{
                        time?: number;
                        x: number;
                        y: number;
                    }[];
                    translate?:{
                        time?: number;
                        x: number;
                        y: number;
                    }[];
                }
            };
            deform?: {
                [skin_id:string]: {
                    [slot_id:SlotID]: {
                        [attachment_id:AttaID]: {
                            curve:number;
                            c3: number;
                            vertices:number[];
                            offset:number;
                            time?:number;
                        }[]
                    }
                }
            };
            drawOrder?: {
                time?: number;
                offsets?: {
                    slot: SlotID;
                    offset: number;
                }[]
            }[];
            transform?: Record<TransID,{
                rotateMix:number;
                translateMix:number;
                scaleMix:number;
                shearMix:number;
            }[]>;
            path?:Record<PathID,{
                    position: {time?: number, position: number}[];
            }>
        };
    };
    path: {
        name: PathID;
        bones: BoneID[];
        target: SlotID;
        order: number;
    }[];
};

const baseExportSetting = {
    class: "export-json",
    name: "JSON",
    open: false,
    extension: ".json",
    format: "JSON",
    prettyPrint: true,
    nonessential: true,
    cleanUp: true,
    packAtlas: null,
    packSource: "attachments",
    packTarget: "perskeleton",
    warnings: true,
};