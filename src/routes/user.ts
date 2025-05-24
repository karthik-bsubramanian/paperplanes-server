import { Hono } from "hono";
import  { PrismaClient }  from '../generated/prisma/edge'; //after generating prisma client the console gives the path on where it has generated the client put that path otherwise it throws an error.
import { withAccelerate } from '@prisma/extension-accelerate';
import { sign } from "hono/jwt";
import { SignupInputSchema } from '@karthikbalasubramanian/paperplanes-types';
import { SigninInputSchema } from "@karthikbalasubramanian/paperplanes-types";

type Bindings={
    DATABASE_URL: string,
    JWT_SECRET: string
}

const user = new Hono<{Bindings:Bindings}>();

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
                password: body.password,
                name: body.name
            }
        })

        const token = await sign({id: user.id},c.env.JWT_SECRET);

        c.status(201); //user successfully created
        return c.json({
            jwt: token
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
        c.status(404)
        return c.json({
            message: "user not found"
        })
    }
    const token = await sign({id: user.id},c.env.JWT_SECRET);
    return c.json({
        jwt: token
    });
})

export default user;