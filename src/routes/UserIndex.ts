import { Hono } from "hono";
import  { PrismaClient }  from '../generated/prisma/edge'; 
import { withAccelerate } from '@prisma/extension-accelerate';
import { sign } from "hono/jwt";
import { SignupInputSchema } from '@karthikbalasubramanian/paperplanes';
import { SigninInputSchema } from "@karthikbalasubramanian/paperplanes";
import actions from "./UserActions";

type Bindings={
    DATABASE_URL: string,
    JWT_SECRET: string
}

type Variables = {
    "userId": string;
}

const user = new Hono<{
    Bindings:Bindings
    Variables: Variables

}>();

user.route('/action',actions);



user.post("/signup",async (c)=>{
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    const body = await c.req.json();
    
    const success = SignupInputSchema.safeParse(body);

    if(!success){
        c.status(411);
        return c.json({
            message: "incorrect inputs"
        })
    }

    //finding the existing user database query is saved using try catch.
    try{
        const user = await prisma.user.create({
        data:{
                email: body.email,
                name: body.name,
                image: body.image,
                googleId: body.googleId
            }
        })

        const token = await sign({id: user.id},c.env.JWT_SECRET);

        c.status(201); //user successfully created
        return c.json({
            jwt: token,
            id: user.id,
            image: user.image,
            name: user.name
        });
    }catch(e:any){
        c.status(409); //conflicting user
       return c.json({
        message: e.message
       }) 
    } 
})

user.post("/signin",async (c)=>{
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    const body = await c.req.json();

    const success = SigninInputSchema.safeParse(body);

    if(!success){
        c.status(411);
        return c.json({
            message: "incorrect inputs"
        })
    }

    const user = await prisma.user.findFirst({
        where:{
            email: body.email
        }
    })
    if(!user){
        c.status(400)
        return c.json({
            message: "user not found"
        })
    }
    const token = await sign({id: user.id},c.env.JWT_SECRET);
    return c.json({
        jwt: token,
        id: user.id,
        image: user.image,
        name: user.name
    });
})




user.get("/publishedposts/:id", async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());

    interface content {
    type: string;
    text: string;
    [key: string]: any;
    }
    interface contentItem {
    type: string;
    attrs?: {
        src?: string;
        [key: string]: any;
    };
    content: content[];
    [key: string]: any;
    }

    interface ParsedContent {
    [key: string]: any;
    content?: contentItem[];
    }

    const getFirstImageUrl = (content:string)=>{
        const parsedContent: ParsedContent = JSON.parse(content);
        const firstimageurl: string = parsedContent.content?.find((item: contentItem) => item.type === 'image')?.attrs?.src || "https://raylnacnshkklqvwrhsb.supabase.co/storage/v1/object/public/blog-images//paperplanes.png";
        return firstimageurl;
    }

  const id = c.req.param('id');
  try {
    const res = await prisma.post.findMany({
      where: {
        authorId:id
      },
      select:{
        id:true,
        title:true,
        content:true,
        createdAt:true,
        topic:{
            select:{
                name:true
            }
        }
      }
    });
    
    const publishedBlogs = res.map((blog)=>({
        id: blog.id,
        image: getFirstImageUrl(blog.content),
        title: blog.title,
        date: blog.createdAt,
        topic: blog.topic.name
    })) 

    if (res) {
      return c.json({
        publishedBlogs
      });
    }
  } catch (error) {
    return c.json({
      error: "failed to fetch data",
    });
  }
});


user.get('/following/:id',async (c)=>{
    const id = c.req.param('id');
  const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try {
        const res = await prisma.follow.findMany({
            where:{
                followerId: id
            },
            select:{
                following:{
                    select:{
                        name:true,
                        id:true,
                        image:true
                    }
                }
            }
        }) 

        if(!res) return;
        
        const followingPpl = res.map((person)=>({
            id: person.following.id,
            name: person.following.name,
            image: person.following.image
        }))

        c.status(200);
        return c.json({
            followingPpl
        })
    } catch (error) {
        
    }
})

export default user;