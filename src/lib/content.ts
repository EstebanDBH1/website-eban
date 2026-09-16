import { getCollection } from 'astro:content';

export async function getPosts() {
  const posts = await getCollection('articulos', ({ data }) => !data.draft);
  return posts.sort((a, b) => a.data.order - b.data.order);
}

export async function getProjects() {
  const projects = await getCollection('proyectos');
  return projects.sort((a, b) => a.data.order - b.data.order);
}
