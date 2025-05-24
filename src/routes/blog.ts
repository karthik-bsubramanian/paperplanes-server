import { Hono } from "hono";
import { verify } from "hono/jwt";
import  { PrismaClient }  from '../generated/prisma/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import { CreateblogInputSchema } from "@karthikbalasubramanian/paperplanes-types";
import { UpdateblogInputSchema } from "@karthikbalasubramanian/paperplanes-types";

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
blog.use('/*',async (c,next)=>{
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


blog.post("/create",async (c)=>{
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
                authorId: userid
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


blog.put("/update",async (c)=>{
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
    const userid = c.get("userId");
    const prisma = new PrismaClient({
            datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try{
        const blogs = await prisma.post.findMany()

        return c.json({
            data: blogs
        })

    }catch(e:any){
        c.status(500);
        return c.json({
            message: "error while fetching the blog"
        })
    }
})


blog.get("/get",async (c)=>{
    const body = await c.req.json();
    const prisma = new PrismaClient({
            datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try{
        const blog = await prisma.post.findFirst({
        where:{
            id: body.id
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

export default blog;