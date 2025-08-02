import { UtilFT, UtilFunc, sleep } from "@zwa73/utils";



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

