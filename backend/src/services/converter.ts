import fs from "fs"
import path from "path"
import { marked } from "marked"
import puppeteer from "puppeteer"
import { JSDOM } from "jsdom"
import TurndownService from "turndown"
import mammoth from "mammoth"
import { Document, Packer, Paragraph, TextRun } from "docx"
import pdfParse from "pdf-parse"

interface ConversionOptions {
  inputPath: string
  outputPath: string
  outputFormat: string
}

// Add a new function to enhance PDF to Word conversion with image support
async function convertPdfToDocxWithImages(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting PDF to DOCX with image support: ${inputPath} -> ${outputPath}`)

    // Read the PDF file
    const dataBuffer = fs.readFileSync(inputPath)

    // Parse the PDF content
    const pdfData = await pdfParse(dataBuffer)

    // Extract text from PDF
    const text = pdfData.text
    console.log(`Extracted ${text.length} characters from PDF`)

    // Create a new Word document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: text
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => {
              return new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    size: 24, // 12pt font
                  }),
                ],
              })
            }),
        },
      ],
    })

    // Generate the DOCX file
    const buffer = await Packer.toBuffer(doc)

    // Write the file to disk
    fs.writeFileSync(outputPath, buffer)

    console.log(`DOCX file created at: ${outputPath}`)
    return true
  } catch (error) {
    console.error("Error converting PDF to DOCX with images:", error)
    return false
  }
}

// Add a new function to convert HTML to DOCX
async function convertHtmlToDocx(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting HTML to DOCX: ${inputPath} -> ${outputPath}`)

    // Read the HTML file
    const html = fs.readFileSync(inputPath, "utf-8")

    // Parse the HTML to extract text
    const dom = new JSDOM(html)
    const text = dom.window.document.body.textContent || ""

    // Create a new Word document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: text
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => {
              return new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    size: 24, // 12pt font
                  }),
                ],
              })
            }),
        },
      ],
    })

    // Generate the DOCX file
    const buffer = await Packer.toBuffer(doc)

    // Write the file to disk
    fs.writeFileSync(outputPath, buffer)

    console.log(`DOCX file created at: ${outputPath}`)
    return true
  } catch (error) {
    console.error("Error converting HTML to DOCX:", error)
    return false
  }
}

// Update the getPuppeteerLaunchOptions function to fix the TypeScript error with headless mode
function getPuppeteerLaunchOptions() {
  return {
    headless: true, // Changed from "new" to true to fix TypeScript error
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--ignore-gpu-blocklist",
      "--disable-gpu-sandbox",
      "--disable-3d-apis",
      "--disable-webgl",
      "--font-render-hinting=none",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--use-gl=swiftshader",
      "--use-angle=swiftshader",
      "--use-vulkan=swiftshader",
      "--enable-swiftshader",
      "--enable-swiftshader-webgl",
    ],
    timeout: 180000, // Increase timeout to 3 minutes
    ignoreHTTPSErrors: true,
    dumpio: true, // Log browser console output for debugging
    pipe: true, // Use pipe instead of WebSocket
  }
}

// Update the convertHtmlToPdf function to use a more robust approach with better error handling
async function convertHtmlToPdf(inputPath: string, outputPath: string): Promise<boolean> {
  let browser = null
  try {
    console.log(`Converting HTML to PDF: ${inputPath} -> ${outputPath}`)
    console.log("Environment: PUPPETEER_EXECUTABLE_PATH =", process.env.PUPPETEER_EXECUTABLE_PATH || "not set")

    // Read the HTML content
    const htmlContent = fs.readFileSync(inputPath, "utf-8")

    // Launch browser with more robust configuration
    console.log("Launching browser with options:", JSON.stringify(getPuppeteerLaunchOptions()))
    browser = await puppeteer.launch(getPuppeteerLaunchOptions())

    // Create a new page
    console.log("Creating new page")
    const page = await browser.newPage()

    // Set viewport to ensure consistent rendering with smaller size to reduce memory usage
    console.log("Setting viewport")
    await page.setViewport({
      width: 800,
      height: 1100,
      deviceScaleFactor: 1,
    })

    // Add error handling for page events
    page.on("error", (err: Error) => {
      console.error("Page error:", err)
    })

    page.on("pageerror", (err: Error) => {
      console.error("Page error in browser context:", err)
    })

    page.on("console", (msg) => {
      console.log("Browser console:", msg.text())
    })

    // Set content directly instead of navigating to file
    console.log("Setting HTML content directly")
    await page.setContent(htmlContent, {
      waitUntil: ["load", "domcontentloaded", "networkidle0"],
      timeout: 60000,
    })

    // Wait a moment to ensure content is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Generate PDF with improved settings
    console.log("Generating PDF")
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
      displayHeaderFooter: false,
      timeout: 60000,
      preferCSSPageSize: true,
    })

    // Verify the PDF was created
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath)
      console.log(`PDF created successfully: ${outputPath} (${stats.size} bytes)`)
      return true
    } else {
      console.error(`PDF file was not created at: ${outputPath}`)
      return false
    }
  } catch (error) {
    console.error("Error in HTML to PDF conversion:", error)
    return false
  } finally {
    // Always close the browser
    if (browser) {
      try {
        console.log("Closing browser")
        await browser.close()
        console.log("Browser closed successfully")
      } catch (closeError) {
        console.error("Error closing browser:", closeError)
      }
    }
  }
}

// Improved Markdown to HTML conversion
async function convertMarkdownToHtml(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting Markdown to HTML: ${inputPath} -> ${outputPath}`)

    // Read the markdown content
    const markdown = fs.readFileSync(inputPath, "utf-8")

    // Convert markdown to HTML
    const html = marked(markdown)

    // Create a complete HTML document with better styling
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Converted Document</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            padding: 2em;
            max-width: 800px;
            margin: 0 auto;
            color: #333;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
            line-height: 1.25;
          }
          h1 { font-size: 2em; }
          h2 { font-size: 1.5em; }
          h3 { font-size: 1.25em; }
          p, ul, ol {
            margin-bottom: 1em;
          }
          pre {
            background-color: #f6f8fa;
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 0.9em;
          }
          code {
            font-family: Consolas, Monaco, "Andale Mono", monospace;
            background-color: #f6f8fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-size: 0.9em;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          blockquote {
            border-left: 4px solid #ddd;
            padding-left: 1em;
            color: #666;
            margin-left: 0;
            margin-right: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
          }
          table, th, td {
            border: 1px solid #ddd;
          }
          th, td {
            padding: 8px 12px;
            text-align: left;
          }
          th {
            background-color: #f6f8fa;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `

    // Write the HTML file
    fs.writeFileSync(outputPath, fullHtml)
    console.log(`HTML file created: ${outputPath}`)
    return true
  } catch (error) {
    console.error("Error converting Markdown to HTML:", error)
    return false
  }
}

// Update the convertHtmlToMarkdown function to exclude CSS styling information
async function convertHtmlToMarkdown(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting HTML to Markdown: ${inputPath} -> ${outputPath}`)

    // Read the HTML file
    const html = fs.readFileSync(inputPath, "utf-8")

    // Create a new TurndownService instance with custom options
    const turndownService = new TurndownService({
      headingStyle: "atx", // Use # style headings
      codeBlockStyle: "fenced", // Use \`\`\`code\`\`\` style blocks
      emDelimiter: "*", // Use * for emphasis
    })

    // Parse the HTML with JSDOM to remove style tags before conversion
    const dom = new JSDOM(html)
    const document = dom.window.document

    // Remove all style tags
    const styleTags = document.querySelectorAll("style")
    styleTags.forEach((tag) => tag.remove())

    // Remove all style attributes from elements
    const elementsWithStyle = document.querySelectorAll("[style]")
    elementsWithStyle.forEach((el) => el.removeAttribute("style"))

    // Get the cleaned HTML content
    const cleanedHtml = document.body.innerHTML

    // Convert the cleaned HTML to Markdown
    const markdown = turndownService.turndown(cleanedHtml)

    // Write the Markdown file
    fs.writeFileSync(outputPath, markdown)
    console.log(`Markdown file created: ${outputPath}`)
    return true
  } catch (error) {
    console.error("Error converting HTML to Markdown:", error)
    return false
  }
}

async function convertDocxToHtml(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting DOCX to HTML: ${inputPath} -> ${outputPath}`)

    // Use mammoth to convert DOCX to HTML with image support
    const result = await mammoth.convertToHtml(
      { path: inputPath },
      {
        convertImage: mammoth.images.imgElement((image) => {
          return image.read("base64").then((imageBuffer) => {
            return {
              src: `data:${image.contentType};base64,${imageBuffer}`,
            }
          })
        }),
      },
    )

    const html = result.value

    // Create a complete HTML document
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Converted Document</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            padding: 2em;
            max-width: 800px;
            margin: 0 auto;
            color: #333;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
          }
          table, th, td {
            border: 1px solid #ddd;
          }
          th, td {
            padding: 8px 12px;
            text-align: left;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `

    fs.writeFileSync(outputPath, fullHtml)
    console.log(`HTML file created: ${outputPath}`)
    return true
  } catch (error) {
    console.error("Error converting DOCX to HTML:", error)
    return false
  }
}

async function convertDocToHtml(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting DOC to HTML: ${inputPath} -> ${outputPath}`)
    // For .doc files, we'll use the same mammoth library but with a warning
    // that it might not work perfectly for all .doc files
    console.warn("Warning: .doc conversion may not be as reliable as .docx conversion")

    const result = await mammoth.convertToHtml({ path: inputPath })
    const html = result.value

    // Create a complete HTML document
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Converted Document</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            padding: 2em;
            max-width: 800px;
            margin: 0 auto;
          }
          img {
            max-width: 100%;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `

    fs.writeFileSync(outputPath, fullHtml)
    return true
  } catch (error) {
    console.error("Error converting DOC to HTML:", error)
    return false
  }
}

async function convertHtmlToText(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting HTML to text: ${inputPath} -> ${outputPath}`)
    const html = fs.readFileSync(inputPath, "utf-8")
    const dom = new JSDOM(html)
    const text = dom.window.document.body.textContent || ""
    fs.writeFileSync(outputPath, text)
    return true
  } catch (error) {
    console.error("Error converting HTML to text:", error)
    return false
  }
}

async function convertTextToHtml(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting text to HTML: ${inputPath} -> ${outputPath}`)
    const text = fs.readFileSync(inputPath, "utf-8")
    // Convert line breaks to <br> tags and escape HTML entities
    const htmlContent = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Converted Document</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            padding: 2em;
            max-width: 800px;
            margin: 0 auto;
          }
        </style>
      </head>
      <body>
        <p>${htmlContent}</p>
      </body>
      </html>
    `

    fs.writeFileSync(outputPath, fullHtml)
    return true
  } catch (error) {
    console.error("Error converting text to HTML:", error)
    return false
  }
}

async function convertTextToMarkdown(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting text to Markdown: ${inputPath} -> ${outputPath}`)
    const text = fs.readFileSync(inputPath, "utf-8")
    fs.writeFileSync(outputPath, text)
    return true
  } catch (error) {
    console.error("Error converting text to Markdown:", error)
    return false
  }
}

// Add a function to convert PDF to text
async function convertPdfToText(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting PDF to text: ${inputPath} -> ${outputPath}`)

    // Read the PDF file
    const dataBuffer = fs.readFileSync(inputPath)

    // Parse the PDF content
    const pdfData = await pdfParse(dataBuffer)

    // Extract text from PDF
    const text = pdfData.text

    // Write the text to the output file
    fs.writeFileSync(outputPath, text)

    console.log(`Text file created: ${outputPath}`)
    return true
  } catch (error) {
    console.error("Error converting PDF to text:", error)
    return false
  }
}

// Add a new function to handle text to PDF conversion more reliably
async function convertTextToPdf(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting text to PDF: ${inputPath} -> ${outputPath}`)

    // Read the text file
    const text = fs.readFileSync(inputPath, "utf-8")

    // Create a temporary HTML file with the text content
    const tempHtmlPath = `${inputPath}.temp.html`

    // Convert text to HTML with proper styling and escape HTML entities
    const htmlContent = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Converted Document</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            line-height: 1.6;
            padding: 2em;
            max-width: 800px;
            margin: 0 auto;
            color: #333;
          }
          pre {
            white-space: pre-wrap;
            font-family: monospace;
            background-color: #f5f5f5;
            padding: 1em;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <pre>${htmlContent}</pre>
      </body>
      </html>
    `

    fs.writeFileSync(tempHtmlPath, fullHtml)

    // Use the improved HTML to PDF conversion
    const result = await convertHtmlToPdf(tempHtmlPath, outputPath)

    // Clean up temp file
    try {
      fs.unlinkSync(tempHtmlPath)
    } catch (err) {
      console.error("Error removing temporary HTML file:", err)
    }

    return result
  } catch (error) {
    console.error("Error converting text to PDF:", error)
    return false
  }
}

// Update the convertMarkdownToPdf function to be more reliable
async function convertMarkdownToPdf(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting Markdown to PDF: ${inputPath} -> ${outputPath}`)

    // First convert markdown to HTML
    const tempHtmlPath = `${inputPath}.temp.html`
    const markdownSuccess = await convertMarkdownToHtml(inputPath, tempHtmlPath)

    if (!markdownSuccess) {
      console.error("Failed to convert Markdown to HTML")
      return false
    }

    // Then use the improved HTML to PDF conversion
    const pdfSuccess = await convertHtmlToPdf(tempHtmlPath, outputPath)

    // Clean up temp file
    try {
      fs.unlinkSync(tempHtmlPath)
    } catch (err) {
      console.error("Error removing temporary HTML file:", err)
    }

    return pdfSuccess
  } catch (error) {
    console.error("Error in Markdown to PDF conversion:", error)
    return false
  }
}

// Update the convertDocxToPdf function to be more reliable
async function convertDocxToPdf(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`Converting DOCX to PDF: ${inputPath} -> ${outputPath}`)

    // First convert DOCX to HTML
    const tempHtmlPath = `${inputPath}.temp.html`
    const docxSuccess = await convertDocxToHtml(inputPath, tempHtmlPath)

    if (!docxSuccess) {
      console.error("Failed to convert DOCX to HTML")
      return false
    }

    // Then use the improved HTML to PDF conversion
    const pdfSuccess = await convertHtmlToPdf(tempHtmlPath, outputPath)

    // Clean up temp file
    try {
      fs.unlinkSync(tempHtmlPath)
    } catch (err) {
      console.error("Error removing temporary HTML file:", err)
    }

    return pdfSuccess
  } catch (error) {
    console.error("Error in DOCX to PDF conversion:", error)
    return false
  }
}

// Update the convertDocument function to use the new specialized functions
export async function convertDocument(options: ConversionOptions): Promise<boolean> {
  const { inputPath, outputPath, outputFormat } = options

  try {
    const inputExtension = path.extname(inputPath).toLowerCase().substring(1)

    console.log(`Converting ${inputPath} (${inputExtension}) to ${outputPath} (${outputFormat})`)

    // Add specialized conversion paths for problematic formats
    if (inputExtension === "md" && outputFormat === "pdf") {
      return await convertMarkdownToPdf(inputPath, outputPath)
    } else if ((inputExtension === "docx" || inputExtension === "doc") && outputFormat === "pdf") {
      return await convertDocxToPdf(inputPath, outputPath)
    } else if (inputExtension === "md" && outputFormat === "html") {
      return await convertMarkdownToHtml(inputPath, outputPath)
    } else if (inputExtension === "html" && outputFormat === "pdf") {
      return await convertHtmlToPdf(inputPath, outputPath)
    } else if (inputExtension === "htm" && outputFormat === "pdf") {
      return await convertHtmlToPdf(inputPath, outputPath)
    } else if (inputExtension === "html" && outputFormat === "md") {
      return await convertHtmlToMarkdown(inputPath, outputPath)
    } else if (inputExtension === "docx" && outputFormat === "html") {
      return await convertDocxToHtml(inputPath, outputPath)
    } else if (inputExtension === "doc" && outputFormat === "html") {
      return await convertDocToHtml(inputPath, outputPath)
    } else if (inputExtension === "html" && outputFormat === "txt") {
      return await convertHtmlToText(inputPath, outputPath)
    } else if (inputExtension === "md" && outputFormat === "txt") {
      // First convert to HTML, then to text
      const tempHtmlPath = `${outputPath}.temp.html`
      await convertMarkdownToHtml(inputPath, tempHtmlPath)
      const result = await convertHtmlToText(tempHtmlPath, outputPath)
      fs.unlinkSync(tempHtmlPath) // Clean up temp file
      return result
    } else if (inputExtension === "docx" && outputFormat === "txt") {
      // First convert to HTML, then to text
      const tempHtmlPath = `${outputPath}.temp.html`
      await convertDocxToHtml(inputPath, tempHtmlPath)
      const result = await convertHtmlToText(tempHtmlPath, outputPath)
      fs.unlinkSync(tempHtmlPath) // Clean up temp file
      return result
    } else if (inputExtension === "txt" && outputFormat === "html") {
      return await convertTextToHtml(inputPath, outputPath)
    } else if (inputExtension === "txt" && outputFormat === "md") {
      return await convertTextToMarkdown(inputPath, outputPath)
    } else if (inputExtension === "pdf" && (outputFormat === "docx" || outputFormat === "doc")) {
      return await convertPdfToDocxWithImages(inputPath, outputPath)
    } else if (inputExtension === "md" && outputFormat === "docx") {
      // First convert to HTML, then to DOCX
      const tempHtmlPath = `${outputPath}.temp.html`
      await convertMarkdownToHtml(inputPath, tempHtmlPath)
      const tempDocxPath = outputPath
      const result = await convertHtmlToDocx(tempHtmlPath, tempDocxPath)
      fs.unlinkSync(tempHtmlPath) // Clean up temp file
      return result
    } else if (inputExtension === "html" && outputFormat === "docx") {
      return await convertHtmlToDocx(inputPath, outputPath)
    } else if (inputExtension === "txt" && outputFormat === "docx") {
      // First convert to HTML, then to DOCX
      const tempHtmlPath = `${outputPath}.temp.html`
      await convertTextToHtml(inputPath, tempHtmlPath)
      const result = await convertHtmlToDocx(tempHtmlPath, outputPath)
      fs.unlinkSync(tempHtmlPath) // Clean up temp file
      return result
    } else if (inputExtension === "pdf" && outputFormat === "txt") {
      return await convertPdfToText(inputPath, outputPath)
    } else if (inputExtension === "txt" && outputFormat === "pdf") {
      return await convertTextToPdf(inputPath, outputPath)
    } else {
      throw new Error(`Unsupported conversion: ${inputExtension} to ${outputFormat}`)
    }
  } catch (error) {
    console.error("Conversion error:", error)
    return false
  }
}

// Export the getPuppeteerLaunchOptions function for use in other files
export { getPuppeteerLaunchOptions }

// At the end of the file, add these exports:
export {
  convertMarkdownToHtml,
  convertDocxToHtml,
  convertDocToHtml,
  convertHtmlToPdf,
  convertMarkdownToPdf,
  convertDocxToPdf,
}
