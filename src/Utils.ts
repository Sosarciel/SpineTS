import * as fs from 'fs';
import { PNG } from 'pngjs';
import { SpineBone, SpineSkin } from './SpineBase';
import { deepClone } from '@zwa73/utils';
import { StringIdSpineSkin } from './SpineTS';

/**将预乘 alpha 的图像转换为非预乘 alpha 的图像
 * @param filePath - 输入图像的文件路径
 * @param outputPath - 输出图像的文件路径
 */
export async function unpreMultiplyAlphaImage(filePath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(new PNG())
            .on("parsed", function () {
                const channels = 4; // 在 pngjs 中，我们总是有 RGBA 四个通道
                for (let i = 0; i < this.data.length; i += channels) {
                    const alpha = this.data[i + channels - 1] / 255;
                    if (alpha === 0) continue;
                    for (let c = 0; c < channels - 1; c++)
                        this.data[i + c] = Math.floor(Math.min(this.data[i + c] / alpha, 255));
                }
                this.pack()
                    .pipe(fs.createWriteStream(outputPath))
                    .on("finish", resolve)
                    .on("error", reject);
            });
    });
}

/**将 vertices 中的 bone 下标转换为对应的 bone id。
 * @param vertices - 包含 bone 下标的 vertices 数组。
 * @param bones - 包含 bone 信息的 bones 数组。
 * @returns 转换后的 vertices 数组，其中 bone 下标已被替换为对应的 bone id。
 * @throws - 如果在 bones 数组中找不到对应的 bone，将抛出错误。
 */
export function convertBoneIdToString(vertices: number[], bones: SpineBone[]) {
    //如果第一个并非整数 则直接返回
    if(vertices[0]===undefined || !Number.isInteger(vertices[0]) || !Number.isInteger(vertices[1]) || vertices.length==8)
        return vertices;
    const convertedVertices: (string | number)[] = [];

    // 遍历 vertices 数组，对每个节进行处理
    for (let i = 0; i < vertices.length; ) {
        // 取出表示3D坐标数量的数字
        const posCount = vertices[i];
        convertedVertices.push(posCount);

        for(let j=0;j<posCount;j++){
            // 取出表示 bone 下标的数字
            const ofst = i + j*4;
            const boneIndex = vertices[ofst+1];

            // 在 bones 数组中查找对应的 bone
            const boneId = bones[boneIndex]?.name;

            // 如果找不到对应的 bone，抛出错误
            if (boneId === undefined)
                throw new Error(`未找到骨骼下标: ${boneIndex}\nvertices:${vertices}\ni: ${i}`);

            // 将该节的第二个元素（表示 bone 下标的数字）替换为 bone 的 name
            convertedVertices.push(boneId, ...vertices.slice(ofst + 2, ofst + 5));
        }

        // 移动到下一个节
        i = convertedVertices.length;
    }

    return convertedVertices;
}

/**将 vertices 中的 bone id 转换回对应的 bone 下标。
 * @param vertices - 包含 bone id 的 vertices 数组。
 * @param bones - 包含 bone 信息的 bones 数组。
 * @returns 转换后的 vertices 数组，其中 bone id 已被替换为对应的 bone 下标。
 * @throws - 如果在 bones 数组中找不到对应的 bone，将抛出错误。
 */
export function convertBoneIdToIndex(vertices: (string | number)[], bones: SpineBone[]) {
    return vertices.map((v)=>{
        if(typeof v === 'string'){
            const i = bones.findIndex(bone => bone.name === v);
            if(i===-1) throw new Error(`骨骼:${v} 未能找到\nbones:${JSON.stringify(bones)}`);
            return i;
        }
        return v;
    });
}

export function convertSkinVerticesToString(skins: SpineSkin[], bones: SpineBone[]){
    const out:StringIdSpineSkin[] = deepClone(skins);
    out.forEach((s)=>{
        Object.entries(s.attachments).forEach(([k1,v1])=>{
            Object.entries(v1).forEach(([k2,v2])=>{
                //if('vertices' in v2 && v2.type=="path"){
                //    console.log(v2.vertices)
                //    console.log(convertBoneIdToString(v2.vertices as number[],bones))
                //    v2.vertices = convertBoneIdToString(v2.vertices as number[],bones);
                //}
                if('vertices' in v2){
                    v2.vertices = convertBoneIdToString(v2.vertices as number[],bones);
                }
            })
        })
    })
    return out;
}

export function convertSkinVerticesToIndex(skins: StringIdSpineSkin[], bones: SpineBone[]){
    const out:SpineSkin[] = deepClone(skins) as any;
    out.forEach((s)=>{
        Object.entries(s.attachments).forEach(([k1,v1])=>{
            Object.entries(v1).forEach(([k2,v2])=>{
                if('vertices' in v2){
                    v2.vertices = convertBoneIdToIndex(v2.vertices,bones);
                }
            })
        })
    })
    return out;
}
/**递归合并两个对象
 * 如果是对象则assign如果是数组则concat
 */
export function mergeObject(main:any,sub:any){
    for(const key in sub){
        const val = sub[key];
        if(Array.isArray(val)){
            main[key] = main[key] ??[];
            main[key].push(...val);
        }else if(typeof val === 'object'){
            main[key] = main[key]??{};
            mergeObject(main[key],val);
        }else main[key] = val;
    }
}


