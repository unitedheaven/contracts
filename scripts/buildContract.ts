import * as fs from 'fs'
import * as ts from 'typescript'
import * as path from 'path'
import { execSync } from 'child_process'

const BASE_DIR = path.join(__dirname, '..')
const contractsDir = path.join(BASE_DIR, 'contracts')
const clientsDir = path.join(BASE_DIR, 'contracts/clients')
const artifactsDir = path.join(BASE_DIR, 'contracts/artifacts')
const componentsDir = path.join(BASE_DIR, 'contracts/components')

console.log('🚀 Starting to build contracts...')

/**
 * Finds the name of the class that extends 'Contract' in a TypeScript file.
 * @param filePath The path to the TypeScript file.
 * @returns The name of the class that extends 'Contract', or null if not found.
 */
const findContractClassName = (filePath: string): string | null => {
    const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath).toString(),
        ts.ScriptTarget.ES2015,
        /*setParentNodes */ true,
    )

    let className: string | null = null

    const findClassName = (node: ts.Node) => {
        if (ts.isClassDeclaration(node) && node.name && node.heritageClauses) {
            for (const clause of node.heritageClauses) {
                if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                    for (const type of clause.types) {
                        if (type.expression.getText() === 'Contract') {
                            className = node.name.getText(sourceFile)
                            return
                        }
                    }
                }
            }
        }

        ts.forEachChild(node, findClassName)
    }

    findClassName(sourceFile)

    return className
}

/**
 * Clears all files and subdirectories in a given directory.
 * @param dir The directory to clear.
 */
const clearDirectory = (dir: string) => {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(file => {
            const curPath = path.join(dir, file)
            if (fs.lstatSync(curPath).isDirectory()) {
                clearDirectory(curPath)
                fs.rmdirSync(curPath)
            } else {
                fs.unlinkSync(curPath)
            }
        })
    }
}

// Clearing directories
clearDirectory(clientsDir)
clearDirectory(artifactsDir)
clearDirectory(componentsDir)

// Create directories if they don't exist
const createDirectoryIfNotExist = (dir: string) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

createDirectoryIfNotExist(clientsDir)
createDirectoryIfNotExist(artifactsDir)
createDirectoryIfNotExist(componentsDir)

fs.readdir(contractsDir, (err, files) => {
    if (err) {
        console.error('⚠️ Error reading contracts directory:', err)
        return
    }

    files
        .filter(file => file.endsWith('.algo.ts'))
        .forEach(file => {
            const baseName = path.basename(file, '.algo.ts')
            const filePath = path.join(contractsDir, file)
            const contractClassName = findContractClassName(filePath)

            if (!contractClassName) {
                console.error(`⚠️ No contract class found in file: ${file}`)
                return
            }

            try {
                // Create directory for artifacts and components
                createDirectoryIfNotExist(path.join(artifactsDir, baseName))
                createDirectoryIfNotExist(path.join(componentsDir, baseName))

                // Compile contract
                execSync(
                    `tealscript contracts/${file} ${artifactsDir}/${baseName}`,
                )

                // Generate client
                execSync(
                    `algokitgen generate -a ${artifactsDir}/${baseName}/${contractClassName}.json -o ${clientsDir}/${baseName}.ts`,
                )

                // Generate components
                execSync(
                    `algokit-generate-component ${artifactsDir}/${baseName}/${contractClassName}.json ${componentsDir}/${baseName}`,
                )
            } catch (error) {
                console.error(`⚠️ Error processing file: ${file}`, error)
            }
        })

    console.log('🎉 Contracts build process completed successfully!')
})
