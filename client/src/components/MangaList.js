import React, { useEffect, useState } from "react";

function MangaList() {
  const [manga, setManga] = useState([]);
  const [genres, setGenres] = useState([]);

  useEffect(() => {
    fetch("/api/manga")
      .then(res => res.json())
      .then(data => setManga(data));
    fetch("/api/genres")
      .then(res => res.json())
      .then(data => setGenres(data));
  }, []);

  return (
    <div>
      <h3>Genres</h3>
      {genres.map(genre => (
        <div key={genre}>
          <h4>{genre}</h4>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {manga.filter(m => m.genre === genre).map(m => (
              <div className="card" style={{ width: "18rem", margin: "0.5rem" }} key={m.id}>
                <img src={m.cover} className="card-img-top" alt="..." />
                <div className="card-body">
                  <h5 className="card-title">{m.title}</h5>
                  <p className="card-text">{m.rating}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MangaList;
