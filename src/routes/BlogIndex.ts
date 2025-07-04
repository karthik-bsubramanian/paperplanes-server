import { Hono } from "hono";
import { verify } from "hono/jwt";
import  { PrismaClient }  from '../generated/prisma/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import { CreateblogInputSchema } from "@karthikbalasubramanian/paperplanes";
import { UpdateblogInputSchema } from "@karthikbalasubramanian/paperplanes";
import { CommentSchema} from "@karthikbalasubramanian/paperplanes"


type Bindings = {
    JWT_SECRET: string;
    DATABASE_URL: string;
}
type Variables = {
    userId: string;
}

const blog = new Hono<{
    Bindings: Bindings;
    Variables: Variables;
}>();

//generic middleware executed before the acutal route handlers
blog.use('protected/*',async (c,next)=>{
    const header = c.req.header("Authorization") || "";
    const token = header.split(" ")[1];
    try{
        const response = await verify(token,c.env.JWT_SECRET);
        if(response.id){
            c.set("userId",String(response.id));
            await next();
        }else{
            c.status(403);
            return c.json({error:"unAuthorized"})
        }
    }catch(e: any){
        c.status(400);
        return c.json({error:"Authentication failed"})
    }
})


blog.post("protected/create",async (c)=>{
    const userid = c.get("userId");
    const body = await c.req.json();
    const { success } = CreateblogInputSchema.safeParse(body); 
    if(!success){
        c.status(411);
        return c.json({
            message: "incorrect inputs"
        })
    }
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try{
        const blog = await prisma.post.create({
            data:{
                title: body.title,
                content: body.content,
                authorId: userid,
                topicId: body.topicId
            }
        })
        c.status(200);
        return c.json({
            "id": blog.id
        })
    }catch(e: any){
        c.status(400);
        return c.json({
            message: e.message
        })
    }
})


blog.put("protected/update",async (c)=>{
    const body = await c.req.json();
    const { success } = UpdateblogInputSchema.safeParse(body); 
    if(!success){
        c.status(411);
        return c.json({
            message: "incorrect inputs"
        })
    }
    const prisma = new PrismaClient({
            datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try{
        const blog = await prisma.post.update({
            where:{
                id: body.id
            },
            data:{
                title: body.title,
                content:body.content
            }
        })

        c.status(200);
        return c.json({
            message: "blog successfully updated",
            id: blog.id
        })

    }catch(e:any){
        c.status(500);
        return c.json({
            message: e.message
        })
    }
})

blog.get("/bulk",async (c)=>{
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    const getFirstImageUrl = (content:string)=>{
        interface ContentItem {
            type: string;
            attrs?: {
                src?: string;
                [key: string]: any;
            };
            [key: string]: any
        }
    
        interface ParsedContent {
            [key: string]: any;
            content?: ContentItem[];
        }
    
        const parsedContent: ParsedContent = JSON.parse(content);
        const firstimageurl: string = parsedContent.content?.find((item: ContentItem) => item.type === 'image')?.attrs?.src || "https://raylnacnshkklqvwrhsb.supabase.co/storage/v1/object/public/blog-images//paperplanes.png";
        return firstimageurl;
    }

    try{
        const blogs = await prisma.post.findMany({
            select:{
                id:true,
                title:true,
                createdAt:true,
                content: true,
                author:{
                    select:{
                        id:true,
                        name:true,
                        image:true
                    }
                }
            }
        })
        
        const blogsWithCoverImage = blogs.map(blog=>({
            id: blog.id,
            title: blog.title,
            createdAt: blog.createdAt,
            author: blog.author,
            firstImageUrl: getFirstImageUrl(blog.content)
        }))

        return c.json({
            data: blogsWithCoverImage
        })

    }catch(e:any){
        c.status(500);
        return c.json({
            message: "error while fetching the blog"
        })
    }
})


blog.get("/get",async (c)=>{
    const id = c.req.query('id');
    const prisma = new PrismaClient({
            datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try{
        const blog = await prisma.post.findFirst({
        where:{
            id
        },
        select:{
            id:true,
            title: true,
            content:true,
            createdAt:true,
            author:{
                select:{
                    name: true,
                    id: true,
                    image: true
                }
            }
        }
        })

        return c.json({
            data: blog
        })
    }catch(e){
        c.status(411);
        return c.json({
            message: "error while fetching the blog"
        })

    }
})

blog.get('/topic',async (c)=>{
    const topicId = Number(c.req.query('topicId')) ?? 1;

    const prisma = new PrismaClient({
            datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    const getFirstImageUrl = (content:string)=>{
        interface ContentItem {
            type: string;
            attrs?: {
                src?: string;
                [key: string]: any;
            };
            [key: string]: any
        }
    
        interface ParsedContent {
            [key: string]: any;
            content?: ContentItem[];
        }
    
        const parsedContent: ParsedContent = JSON.parse(content);
        const firstimageurl: string = parsedContent.content?.find((item: ContentItem) => item.type === 'image')?.attrs?.src || "https://raylnacnshkklqvwrhsb.supabase.co/storage/v1/object/public/blog-images//paperplanes.png";
        return firstimageurl;
    }

    try {
        const response = await prisma.post.findMany({
            where:{
                topicId: topicId
            },select:{
                id: true,
                title: true,
                content: true,
                createdAt: true,
                topic:{
                    select:{
                        name: true
                    }
                },
                author:{
                    select:{
                        id: true,
                        name: true,
                        image: true,
                    }
                }
            }
        }) 
        const count = await prisma.post.count({
            where:{
                topicId
            }
        })

        const modifiedResponse = response.map((res)=>({
            id:res.id,
            title: res.title,
            topic: res.topic.name,
            image: getFirstImageUrl(res.content),
            createdAt: res.createdAt,
            author: res.author
        }))


        c.status(200);
        return c.json({
            data:{
                modifiedResponse,
                noOfPosts: count
            } 
        })
    } catch (error) {
        return c.json({
            error: "Failed to fetch content" +error
        })
    }
})

export default blog;