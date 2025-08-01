import { AnyString, IJData, JToken, UtilFT, UtilFunc, deepClone, sleep } from "@zwa73/utils";
import { SpineAttr, SpineBone, SpineJson, SpineSkin, SpineSlot } from "./SpineBase";
import { convertBoneIdToString, convertSkinVerticesToIndex, convertSkinVerticesToString, mergeObject } from "./Utils";
import path from 'pathe';

/**DAGNode 类型定义，每个节点包含一个可选的父节点ID和一个必需的自身ID。*/
type DAGNode = {
    /**父节点id */
    parent?: string;
    /**节点id */
    name: string;
};
/**DAG 类，用于创建和操作有向无环图（DAG）。
 * @template T DAGNode 的扩展类型。
 */
class DAG<T extends DAGNode> {
    /**存储所有节点的对象，键是节点ID，值是节点对象。*/
    _nodes: Record<string, T> = {};

    /**向 DAG 中添加新的节点。
     * @param nodes 要添加的节点。
     * @throws 如果添加的节点会产生循环，或者节点ID已经存在。
     */
    addNode(...nodes: T[]) {
        for(const node of nodes){
            const whl = this.wouldFormCycle(node.name);
            if (whl) throw new Error(`添加的节点${node.name}产生循环\nlist:${JSON.stringify(whl)}`);
            if (this._nodes[node.name]!=undefined)
                throw new Error(`添加的节点${node.name}重复`);
            this._nodes[node.name] = node;
        }
    }
    /**从dag移除节点
     * @param names 要移除的节点
     */
    delNode(...names:string[]){
        for(const name of names)
            delete this._nodes[name];
    }

    /**检查 DAG 中是否包含指定的节点，如果不包含则抛出错误。
     * @param name 要检查的节点ID。
     * @throws 如果 DAG 不包含指定的节点。
     */
    hasNodeOrThrow(name:string){
        if(this._nodes[name]===undefined)
            throw new Error(`DAG 不包含节点${name}`);
    }

    /**检查指定的节点是否会形成循环。
     * @param name 要检查的节点ID。
     * @returns 如果指定的节点会形成循环，则返回 true，否则返回 false。
     */
    wouldFormCycle(name: string){
        const list:DAGNode[] = [];
        if(this._nodes[name]===undefined)
            return false;
        let currentNode = this._nodes[name];
        while (currentNode) {
            list.push(currentNode);
            if (currentNode.parent === name)
                return list;
            currentNode = this._nodes[currentNode.parent!];
        }
        return false;
    }

    /**从指定的根节点开始遍历 DAG，并返回遍历的结果。
     * @param rootName 要开始遍历的根节点ID。
     * @param maxDepth 遍历深度
     * @returns 遍历的结果，是一个包含所有遍历到的节点的数组。
     * @throws {Error} 如果 DAG 不包含指定的根节点。
     */
    traverse(rootName: string, maxDepth: number = Infinity) {
        this.hasNodeOrThrow(rootName);
        const result: T[] = [];
        const stack: { node: T, depth: number }[] = [
            { node: this._nodes[rootName], depth: 0 }
        ];

        while (stack.length > 0) {
            const dat = stack.pop();
            if(!dat) throw new Error(`广度优先算法pop出现了undefined`);
            const { node, depth } = dat;
            result.push(node);

            if (depth < maxDepth) {
                Object.values(this._nodes).forEach((childNode) => {
                    if (childNode.parent === node.name)
                        stack.push({ node: childNode, depth: depth + 1 });
                });
            }
        }

        return result;
    }
}

type StringIdSkinSub<T> = T extends { vertices: number[] }
    ? Omit<T,'vertices'>&{vertices:(string|number)[]}
    : T;
export type StringIdSpineSkin<TMP = SpineSkin['attachments'][string]> =
    Omit<SpineSkin,'attachments'>&{
        attachments:{
            [id:string]:{
                [P in keyof TMP]: StringIdSkinSub<TMP[P]>
            }
        }
    };
/**经过处理的Spinejson */
type SpineDataTable = Omit<SpineJson,'skins'|'bones'>&{
    bones:DAG<SpineBone>;
    skins:StringIdSpineSkin[];
}
export class SpineData implements IJData{
    private _table:SpineDataTable;
    private _rootName='root';
    constructor(json:SpineJson){
        const {bones,skins,...rest} = json;
        const dag = new DAG();
        //dag.addNode({name:'root'});
        dag.addNode(...bones??[]);
        if(dag._nodes[this._rootName]===undefined)
            throw new Error(`不包含${this._rootName}`);

        this._table = {
            ...rest,
            skins:convertSkinVerticesToString(skins,bones??[]),
            bones:dag
        }
    }

    /**将两个spine模型文件合并 需要先进行replaceID重命名 */
    merge(json:SpineData){
        const {bones,skeleton,skins,slots,transform,ik,path,...rest} = json._table;
        //skeleton仅使用主文件, 不合并
        mergeObject(this._table,rest);
        //在前部加入slot以确保绘制顺序位于主体后
        if(slots){
            this._table.slots = this._table.slots??[];
            this._table.slots.unshift(...slots);
        }
        //在dag加入bone
        this._table.bones.addNode(... bones
            .traverse(json._rootName)
            .filter(o=>o.name!=json._rootName)
        );
        //合并皮肤
        const tskins = this._table.skins;
        for(const skin of skins){
            const sname = skin.name;
            //不存在则创建
            const sini = tskins.findIndex((s)=>s.name===sname);
            if(sini===-1) {
                tskins.push(skin);
                continue;
            }
            //存在则合并
            const tskin = tskins[sini];
            Object.entries(skin.attachments).forEach(([k,v])=>{
                if(tskin.attachments[k]!=undefined) throw new Error(`合并时遇到两个相同id的皮肤槽位 key:${k}`);
                tskin.attachments[k] = skin.attachments[k];
            });
        }
        const orderLength = this.getMaxOrder() + 1;
        //整理transform的order
        if(transform){
            this._table.transform ??= [];
            this._table.transform = [
                ...this._table.transform,
                ...transform.map(t=>{
                    return {...t,order:(t.order??0) + orderLength}
                })
            ]
        }
        //整理ik的order
        if(ik){
            this._table.ik ??= [];
            this._table.ik = [
                ...this._table.ik,
                ...ik.map(t=>{
                    return {...t,order:(t.order??0) + orderLength}
                })
            ]
        }
        //整理path的order
        if(path){
            this._table.path ??= [];
            this._table.path = [
                ...this._table.path,
                ...path.map(t=>{
                    return {...t,order:(t.order??0) + orderLength}
                })
            ]
        }
    }
    /**获取最大的Order -1 为不存在 */
    getMaxOrder(){
        const objlist = [
            ...this._table.transform ?? [],
            ...this._table.ik ?? [],
            ...this._table.path ?? [],
        ]
        let max = -1;
        objlist.forEach(t=>max=Math.max(t.order??0,max));
        return max;
    }

    /**获取皮肤 */
    getSkin(skinName:AnyString|"default"="default"){
        this._table.skins ??= [];
        return this._table.skins.find(s=>s.name==skinName);
    }

    /**添加一个附件 */
    addAttr(skinName:AnyString|"default",slotName:string,attrName:string,attr:SpineAttr){
        this._table.skins ??= [];
        const skin = this._table.skins.find(s=>s.name==skinName);
        if(skin==undefined) throw `addAttr 错误 添加附件时未找到皮肤 ${skinName}`;
        skin.attachments[slotName]??={};
        skin.attachments[slotName][attrName] = attr;
        return attr;
    }
    /**添加一个插槽
     * @param slot     - 要添加的插槽
     * @param order    - 插槽的绘制顺序 默认 0 顶部
     */
    addSlot(slot:SpineSlot,order:number=0){
        this._table.slots ??= [];
        // 计算插入位置，确保不超过数组长度
        const index = Math.min(order, this._table.slots.length);

        // 在指定索引后插入 slot
        this._table.slots.splice(index, 0, slot);

        return slot;
    }

    /**添加一个骨骼 */
    addBone(bone:SpineBone){
        this._table.bones.addNode(bone);
        return bone;
    }
    /**删除一个骨骼 */
    delBone(name:string){
        this._table.bones.delNode(name);
    }
    /**遍历骨骼
     * @param boneId   - 要开始遍历的根节点ID。
     * @param maxDepth - 遍历深度
     */
    traverseBone(boneId:string,depth=Infinity){
        return this._table.bones.traverse(boneId,depth);
    }
    /**根据骨骼id获取对应slot */
    getSlotFromBone(...boneIdList:string[]){
        const slotMap = this._table.slots?.reduce((acc,curr)=>{
            if(acc[curr.bone]!=undefined){
                acc[curr.bone].push(curr);
                return acc;
            }
            return {...acc,[curr.bone]:[curr]};
        },{} as Record<string,SpineSlot[]>);
        if(!slotMap) return [];
        const slotList:SpineSlot[] = [];
        boneIdList.forEach(b=>{
            const s = slotMap[b];
            if(!s) return;
            slotList.push(...s);
        });
        return slotList;
    }
    /**获取根骨骼名 */
    getRootBone(){
        return this._rootName;
    }

    /**对所有的 BoneID 进行替换操作。
     * 不会对 null ID 进行处理
     * @param func - 用于替换 BoneID 的函数。
     */
    replaceBoneID(func:(name:string)=>string,opt?:{ignoreRoot?:boolean}){
        const json = this._table;
        opt = opt??{};
        opt.ignoreRoot = opt.ignoreRoot??true;
        const fixfunc = (str:string)=>{
                if(str==null) return str;
                if(str==this._rootName && opt!.ignoreRoot) return str;
                return func(str);
            };

        const ndag = new DAG();
        const boneTable = json.bones._nodes;
        const nlist = Object.values(boneTable).map((val)=>{
            val.name = fixfunc(val.name);
            if(val.parent!=undefined) val.parent = fixfunc(val.parent);
            if(val.transform !=undefined){
                console.warn("发现一个骨骼有继承设定, 可能导致继承问题:")
                console.warn(val.name,val.transform);
            }
            return val;
        });
        ndag.addNode(...nlist);
        json.bones = ndag;

        json.slots?.forEach((s,i)=>{
            json.slots![i].bone = fixfunc(json.slots![i].bone);
        });
        json.transform?.forEach((s)=>{
            s.bones = s.bones.map(fixfunc);
            s.target = fixfunc(s.target);
        });
        json.ik?.forEach((s)=>{
            s.bones = s.bones.map(fixfunc);
            s.target = fixfunc(s.target);
        });
        json.path?.forEach((p)=>{
            p.bones = p.bones.map(fixfunc);
        });
        if(json.animations!=undefined){
            Object.entries(json.animations).forEach(([k1,v1])=>{
                if(Object.keys(v1.bones??{}).length <= 0)
                    return;
                const tobj:any={};
                Object.entries(v1.bones??{}).forEach(([k2,v2])=>{
                    tobj[fixfunc(k2)]=v2
                });
                json.animations![k1].bones = tobj;
            });
        }
        json.skins.forEach((v1)=>{
            Object.values(v1.attachments).forEach((v2)=>{
                Object.values(v2).forEach((v3)=>{
                    if('vertices' in v3){
                        v3.vertices.forEach((v4,i)=>{
                            if(typeof v4 === 'string')
                                v3.vertices[i] = fixfunc(v4);
                        })
                    }
                    if('parent' in v3)
                        v3.parent = fixfunc(v3.parent);
                })
            })
        })
    }

    /**对所有的 SlotID 进行替换操作。
     * 不会对 null ID 进行处理
     * @param func - 用于替换 SlotID 的函数。
     */
    replaceSlotID(func: (id: string) => string) {
        const json = this._table;

        const fixfunc = (id:string)=>{
            if(id==null) return id;
            return func(id);
        }

        json.path?.forEach((p)=>{
            p.target = fixfunc(p.target);
        });

        json.slots?.forEach((slot) => {
            slot.name = fixfunc(slot.name);
        });

        json.skins.forEach((skin) => {
            const newAttachments: typeof skin.attachments = {};
            Object.entries(skin.attachments).forEach(([slotID, attachments]) => {
                newAttachments[fixfunc(slotID)] = attachments;
            });
            skin.attachments = newAttachments;
        });

        if (json.animations) {
            Object.values(json.animations).forEach((anim) => {
                if (anim.slots) {
                    const newSlots: typeof anim.slots = {};
                    Object.entries(anim.slots).forEach(([slotID, slot]) => {
                        newSlots[fixfunc(slotID)] = slot;
                    });
                    anim.slots = newSlots;
                }
                if (anim.deform) {
                    Object.entries(anim.deform).forEach(([k,v]) => {
                        const newDeform: typeof v = {};
                        Object.entries(v).forEach(([slotID, attachments]) => {
                            newDeform[fixfunc(slotID)] = attachments;
                        });
                        anim.deform![k] = newDeform;
                    });
                }
                anim.drawOrder?.forEach((order)=>{
                    if(order.offsets)
                        order.offsets = order.offsets.map((ob)=>({...ob,slot:fixfunc(ob.slot)}));
                })
            });
        }
    }

    /**对所有的 AttaID 进行替换操作。
     * 不会对 null ID 进行处理
     * @param func - 用于替换 AttaID 的函数。
     */
    replaceAttaID(func: (id: string) => string) {
        const json = this._table;
        const fixfunc = (id:string)=>{
            if(id==null) return id;
            return func(id);
        }
        json.slots?.forEach((slot) => {
            if(slot.attachment)
                slot.attachment = fixfunc(slot.attachment);
        });

        json.skins.forEach((skin) => {
            Object.entries(skin.attachments).forEach(([k,v]) => {
                const newAtta: typeof v = {};
                Object.entries(v).forEach(([attaID, attachment]) => {
                    if('path' in attachment) attachment.path = fixfunc(attachment.path);
                    newAtta[fixfunc(attaID)] = attachment;
                });
                skin.attachments[k] = newAtta;
            });
        });

        if (json.animations) {
            Object.values(json.animations).forEach((animation) => {
                if (animation.slots) {
                    Object.values(animation.slots).forEach((slot) => {
                        slot.attachment?.forEach((attachment) => {
                            attachment.name = fixfunc(attachment.name);
                        });
                    });
                }
                if (animation.deform) {
                    Object.values(animation.deform).forEach((deform) => {
                        Object.entries(deform).forEach(([k,atta]) => {
                            const newAtta: typeof atta = {};
                            Object.entries(atta).forEach(([attaID, attachment]) => {
                                newAtta[fixfunc(attaID)] = attachment;
                            });
                            deform[k] = newAtta;
                        });
                    });
                }
            });
        }
    }

    /**对所有的 动画id 进行替换操作。
     * @param func - 用于替换 AttaID 的函数。
     */
    replaceAnimID(func: (id: string) => string){
        if(!this._table.animations) return;
        const nmap:SpineJson['animations'] ={};
        Object.entries(this._table.animations).forEach(([k,anim])=>{
            nmap[func(k)] = anim;
        });
        this._table.animations = nmap;
    }

    /**对所有的 位置id 进行替换操作。
     * @param func - 用于替换 TransID 的函数。
     */
    replaceTransID(func: (id: string) => string){
        this._table.transform?.forEach((t)=>{
            t.name = func(t.name);
        });
        if(this._table.animations!=undefined){
            Object.entries(this._table.animations).forEach(([k1,v1])=>{
                if(Object.keys(v1.transform??{}).length <= 0)
                    return;
                const tobj:any={};
                Object.entries(v1.transform??{}).forEach(([k2,v2])=>{
                    tobj[func(k2)]=v2
                });
                this._table.animations![k1].transform = tobj;
            });
        }
    }
    /**对所有的 ik id 进行替换操作。
     * @param func - 用于替换 TransID 的函数。
     */
    replaceIkID(func: (id: string) => string){
        this._table.ik?.forEach((t)=>{
            t.name = func(t.name);
        });
    }
    /**对所有的 PathID 进行替换操作。
     * @param func - 用于替换 PathID 的函数。
     */
    replacePathID(func: (id: string) => string) {
        this._table.path?.forEach((path) => {
            path.name = func(path.name);
        });
        if(this._table.animations!=undefined){
            Object.entries(this._table.animations).forEach(([k1,v1])=>{
                if(Object.keys(v1.path??{}).length <= 0)
                    return;
                const tobj:any={};
                Object.entries(v1.path??{}).forEach(([k2,v2])=>{
                    tobj[func(k2)]=v2
                });
                this._table.animations![k1].path = tobj;
            });
        }
    }

    /**计算某个动作的时长 秒 */
    getAnimTime(animName:string){
        let max = 0;
        const anim = this._table.animations?.[animName];
        if(anim==null){
            console.log(`getAnimTime 未能找到 ${animName}`);
            return undefined;
        }

        const maxtime = (o:{time?:number}) => max = Math.max(o.time??0,max);

        Object.values(anim.bones??[]).forEach(bone=>{
            bone.rotate    ?.forEach(maxtime);
            bone.scale     ?.forEach(maxtime);
            bone.translate ?.forEach(maxtime);
        });

        Object.values(anim.slots??[]).forEach(slot=>{
            slot.color     ?.forEach(maxtime);
            slot.attachment?.forEach(maxtime);
        });

        Object.values(anim.deform??[]).forEach(skin=>
            Object.values(skin).forEach(slot=>
                Object.values(slot).forEach(attr=>
                    attr.forEach(maxtime))));

        Object.values(anim.drawOrder??[])
            .forEach(maxtime);

        return max;
    }
    /**计算所有动作的时长 秒 */
    getAnimTimeMap(){
        return Object.entries(this._table.animations??[])
            .reduce((acc,[k,v])=>({...acc,[k]:this.getAnimTime(k)})
                ,{} as Record<string,number|undefined>);
    }
    /** 复制并延长动画的每个部分，以延长整个动画的持续时间 */
    extendAnimationDuration(animName:string,raito:number){
        const anim = this._table.animations?.[animName];
        if(anim==null) throw new Error(`extendAnimationDuration 目标动作不存在 ${animName}`);
        const animTime = this.getAnimTime(animName);
        if(animTime==null) return;

        const rep = (arr?:{time?:number}[])=>{
            if(arr==null) return;
            const oarr = deepClone(arr);
            const dupv = (index:number)=>
                oarr.map(v=>({...v,time: (v.time??0) + index * animTime}));
            for(let i=1;i<raito;i++)
                arr.push(...dupv(i));
        }

        Object.values(anim.bones??[]).forEach(bone=>{
            rep(bone.rotate   );
            rep(bone.scale    );
            rep(bone.translate);
        });

        Object.values(anim.slots??[]).forEach(slot=>{
            rep(slot.color     );
            rep(slot.attachment);
        });

        Object.values(anim.deform??[]).forEach(skin=>
            Object.values(skin).forEach(slot=>
                Object.values(slot).forEach(attr=>rep(attr))));

        rep(anim.drawOrder);

        Object.values(anim.path??{}).forEach(con=>rep(con.position))
    }
    toJSON() {
        const {bones,skins,...rest} = this._table
        const arrBones = bones.traverse(this._rootName);
        return {
            ...rest,
            bones:arrBones,
            skins:convertSkinVerticesToIndex(skins,arrBones),
        } as SpineJson
    }
}
/**等待某个路径直到出现
 * @param filePath    检测的路径
 * @param maxWaitTime 最大允许时间/秒
 */
async function checkFileExists(filePath: string, maxWaitTime: number) {
    for(let i = 0; i < maxWaitTime; i++) {
        await sleep(1000);
        if(await UtilFT.pathExists(filePath)) return;
    }
    throw new Error('文件等待超时');
}


export class SpineTS {
    static spineCLIPath: string;
    static exportSettings: string;

    /**初始化 SpineTS 类。
     * @param spineCLIPath   - spine.com 的路径。
     * @param exportSettings - 导出设置的路径
     */
    static init(spineCLIPath: string, exportSettings: string) {
        this.spineCLIPath = spineCLIPath;
        this.exportSettings = exportSettings;
    }

    private static checkOrThrow(){
        if(this.spineCLIPath===undefined || this.exportSettings===undefined)
            throw new Error(`未进行 SpineTS.init`);
    }

    /**导入为 spine，并调整比例。
     * @param skelPath - skel 的路径
     * @param outPath  - 输出路径, 扩展名必须是.spine
     * @param scale    - 导入比例
     */
    static async importAndAdjustScale(skelPath: string, outPath: `${string}.spine`, scale: number) {
        this.checkOrThrow();
        const command = `${this.spineCLIPath} -i "${skelPath}" -o "${outPath}" -s ${scale} -r`;
        await UtilFunc.exec(command, { outlvl: "info", errlvl: "info" });
        await checkFileExists(outPath,30);
    }

    /**导入 spine，并导出 json。
     * @param spinePath - spine/skel 的路径
     * @param outPath   - 输出路径
     */
    static async importAndExportJson(spinePath: string, outPath: string) {
        this.checkOrThrow();
        const command = `${this.spineCLIPath} -i "${spinePath}" -o "${outPath}" -e "${this.exportSettings}"`;
        await UtilFunc.exec(command, { outlvl: "info", errlvl: "info" });
        await checkFileExists(outPath,30);
    }

    /**进行纹理解包。
     * @param pngFolder - 纹理图片文件夹的路径。
     * @param outPath   - 输出路径。
     * @param atlasPath - atlas 文件的路径。
     */
    static async unpackTexture(pngFolder: string, outPath: string, atlasPath: string) {
        this.checkOrThrow();
        const command = `${this.spineCLIPath} -i "${pngFolder}" -o "${outPath}" -c "${atlasPath}"`;
        return await UtilFunc.exec(command, { outlvl: "info", errlvl: "info" });
    }
}

