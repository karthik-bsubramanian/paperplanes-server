import { Hono } from "hono";
import  { PrismaClient }  from '../generated/prisma/edge'; 
import { withAccelerate } from '@prisma/extension-accelerate';
import { verify } from "hono/jwt";
import { UserSavedPostSchema } from "@karthikbalasubramanian/paperplanes";



type Bindings={
    DATABASE_URL: string,
    JWT_SECRET: string
}

type Variables = {
    "userId": string;
}

const actions = new Hono<{
    Bindings:Bindings
    Variables: Variables

}>();

actions.use('/*',async (c,next)=>{
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

actions.get('/me',async (c)=>{
    const userId = c.get('userId');
  const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())
    
    try {
    const userData = await prisma.user.findFirst({
        where:{
            id: userId
        },select:{
            id: true,
            image:true,
            name: true,
        }

    }) 
    
    c.status(200);
    return c.json({
        user: userData
    })
    } catch (error) {
           c.status(404);
           c.json({
            error: 'user not found'
           }) 
    }
})

actions.post("/save",async (c)=>{
    const userid = c.get("userId")
  const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())
    
    const body = await c.req.json();
    const success = await UserSavedPostSchema.safeParse(body);
    if(!success){
        c.status(411);
        return c.json({
            message: "incorrect inputs"
        })
    }
    try{
        const saved = await prisma.userSavedPost.create({
            data:{
                userId: userid,
                postId: body.id
            }
        })

        if(saved){
          c.status(200);
          return c.json({ message: "saved succcessfully"}) 
        }
    }catch(e:any){
        return c.json({
            message: e.message
        })
    }
})

actions.get('/whotofollow',async(c)=>{
    const userid = c.get("userId")
  const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

    try {
        const users = await prisma.$queryRaw`
        SELECT "name","id","image" FROM "User"
        WHERE "id" != ${userid}
        AND "id" NOT IN (
            SELECT "followingId" FROM "Follow"
            WHERE "followerId" = ${userid}
        )
        ORDER BY RANDOM()
        LIMIT 3;
        `
        return c.json(users as any[]);
    } catch (err) {
        console.error(err)
        return c.json({ error: 'Failed to fetch suggested users' }, 500)
    }
})

actions.post('/follow',async(c)=>{
    const userid = c.get("userId")
  const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())
    const body: any = await c.req.json();

    try {
        const res = await prisma.follow.create({
            data:{
                followerId: userid,
                followingId: body.id
            }
        })
        if(res){
            c.status(200);
            return c.json({
                message: "followed successfully"
            })
        }
        
    } catch (error:any) {
        if (error.code === 'P2002') {
        // Unique constraint failed
        return c.json({ error: 'You already follow this user' }, 409)
        }

        console.error(error);
        c.status(400);
        return c.json({
            error: error
        })
    }
})


actions.get('/followingblogs',async (c)=>{
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

        interface content{
            type:string;
            text:string;
            [key:string]:any;
        }
        interface contentItem {
            type: string;
            attrs?: {
                src?: string;
                [key: string]: any;
            };
            content: content[]
            [key: string]: any
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

    const getDescriptionFromContent = (content:string)=>{
        const parsedContent:ParsedContent = JSON.parse(content);
        const description: string = parsedContent.content?.find((item:contentItem)=>item.type==='paragraph')?.content[0]?.text || "";
        return description;
    }

    const isThisPostSaved = (savedBy: { userId: string; postId: string }[]) => {
        const userid = c.get("userId");
        return savedBy.some((entry) => entry.userId === userid);
    }

    const userid = c.get("userId")
    const limit = Number(c.req.query('limit')) || 5;
    const cursor = c.req.query('cursor');

    try {
        const follows = await prisma.follow.findMany({
            where:{
                followerId:userid
            },
            select:{
                followingId:true
            }
        });

        const followingIds = follows.map(f=>f.followingId);
        const posts = await prisma.post.findMany({
            where:{
                authorId:{
                    in: followingIds
                }
            },
            orderBy:{
                createdAt:'desc'
            },
            take:limit,
            ...(cursor&&({
                skip:1,
                cursor:{
                    id: cursor
                }
            })),
            select:{
                id: true,
                title:true,
                content:true,
                author:{
                    select:{
                        name: true,
                        id: true,
                    }
                },
                savedBy: true,
                topic:true,
                createdAt:true
            }
        })

        const formattedBlogs = posts.map(post=>({
            id: post.id,
            title: post.title,
            description: getDescriptionFromContent(post.content),
            image: getFirstImageUrl(post.content),
            userId: post.author.id,
            userName: post.author.name,
            createdAt: post.createdAt,
            topic: post.topic.name,
            isSaved: isThisPostSaved(post.savedBy)
        }))
        return c.json({
            data: formattedBlogs,
            nextCursor: formattedBlogs.length === limit ? formattedBlogs[formattedBlogs.length -1].id : null
        })
    } catch (error) {
        return c.json({
            error: "error while fetching following posts" + error
    })
    }
})

actions.get('/savedposts',async(c)=>{
    const userId = c.get('userId');
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())

        interface content{
            type:string;
            text:string;
            [key:string]:any;
        }
        interface contentItem {
            type: string;
            attrs?: {
                src?: string;
                [key: string]: any;
            };
            content: content[]
            [key: string]: any
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
    
    try {
        
        const res = await prisma.userSavedPost.findMany({
            where:{
                userId
            },
            select:{
                post:{
                    select:{
                        id:true,
                        title:true,
                        content:true,
                        createdAt: true,
                        author: true,
                        topic:{
                            select:{
                                name: true
                            }
                        }
                    }
                }
            }
        })

        const savedPosts = res.map((post)=>({
            id: post.post.id,
            image: getFirstImageUrl(post.post.content),
            title: post.post.title,
            createdAt: post.post.createdAt,
            author: post.post.author,
            topic: post.post.topic.name
        }))

        return c.json({
            savedPosts  
        })
    } catch (error) {
       return c.json({
        error: "Failed to fetch saved posts"
       }) 
    }

})


actions.get('/profile/:id', async (c) => {
    const prisma = new PrismaClient({
        datasourceUrl: c.env.DATABASE_URL
    }).$extends(withAccelerate())
    
    const requesterId = c.get('userId');
    const userId = c.req.param('id');
    
    try {
        const user = await prisma.user.findFirst({
            where: {
                id: userId
            },
            select: {
                name: true,
                image: true
            }
        })

        if (!user) {
            c.status(404);
            return c.json({
                error: "User not found"
            })
        }

        const followRecord = await prisma.follow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: requesterId,
                    followingId: userId
                }
            }
        })

        const response = {
            name: user.name,
            image: user.image,
            isFollowed: followRecord !== null
        }
        
        
        c.status(200);
        return c.json({
            response
        })
    } catch (error) {
        c.status(500);
        return c.json({
            error: "failed to fetch data"
        })    
    }
})


export default actions;