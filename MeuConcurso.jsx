import React, { useState, useEffect } from "react";
import { Input } from "../../shadcn/components/ui/input";
import { Textarea } from "../../shadcn/components/ui/textarea";
import { BarChartIcon, Pencil1Icon, TrashIcon } from "@radix-ui/react-icons";
import { Button } from "../../shadcn/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../../shadcn/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogAction,
} from "../../shadcn/components/ui/alert-dialog";
import "./MeuConcurso.css";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuthContext } from "../../hooks/useAuthContext";
import { Card, CardContent } from "../../shadcn/components/ui/card";
import { InfoCircledIcon } from "@radix-ui/react-icons";

const MeuConcurso = () => {
  const [materia, setMateria] = useState("");
  const [topicos, setTopicos] = useState("");
  const [materias, setMaterias] = useState([]);
  const [editingMateria, setEditingMateria] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [checkedItems, setCheckedItems] = useState([]);
  const userId = useAuthContext().user?.uid;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMateria, setSelectedMateria] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const toggleDialog = () => {
    setIsDialogOpen(!isDialogOpen);
  };

  const updateFirestore = async (materia, tpcList) => {
    const materiaRef = doc(db, "materias", materia.id);
    await setDoc(materiaRef, { nome: materia.nome, topicos: tpcList });
  };

  const contarItens = (topicos) => {
    let count = 0;
    for (const topico of topicos) {
      if (topico.nome.trim() !== "") {
        count += 1;
      }

      if (topico.subtopicos && topico.subtopicos.length > 0) {
        count += contarItens(topico.subtopicos);
      }
    }
    return count;
  };

  // Função para lidar com a marcação de itens concluídos
  const handleCheck = async (topicoIndex, materiaIndex) => {
    const materiaId = materias[materiaIndex].id;
    const newMaterias = [...materias];
    const checkedValue = !materias[materiaIndex].topicos[topicoIndex].lido;
    const newCheckedItems = [...checkedItems];
    const foundIndex = newCheckedItems.findIndex(
      (item) =>
        String(item.materiaIndex) === String(materiaIndex) &&
        String(item.topicoIndex) === String(topicoIndex)
    );

    // Atualiza o estado de leitura do tópico no Firebase
    const materiaRef = doc(db, "materias", materiaId);
    const updatedTopic = {
      ...materias[materiaIndex].topicos[topicoIndex],
      lido: checkedValue,
    };

    // Atualiza o estado de leitura do tópico no Firebase
    await setDoc(
      materiaRef,
      {
        topicos: newMaterias[materiaIndex].topicos.map((topic, index) =>
          index === topicoIndex ? updatedTopic : topic
        ),
      },
      { merge: true }
    );

    // Atualiza o estado local apenas se a atualização no Firebase for bem-sucedida
    newMaterias[materiaIndex].topicos[topicoIndex].lido = checkedValue;
    setMaterias(newMaterias);

    if (foundIndex !== -1) {
      newCheckedItems.splice(foundIndex, 1);
    } else {
      newCheckedItems.push({ materiaIndex, topicoIndex });
    }

    setCheckedItems(newCheckedItems);
  };

  const handleAdicionar = async () => {
    const topicosArray = topicos.split("\n");
    const tpcList = [];
    let tpcStack = [];

    for (const linha of topicosArray) {
      const trimmedLinha = linha.trim();
      const match = trimmedLinha.match(/^(-*)\s(.*)/);

      if (match) {
        const indent = match[1].length;
        const nomeTopico = match[2];

        while (tpcStack.length > indent) {
          tpcStack.pop();
        }

        const tpc = {
          nome: nomeTopico,
          isPrincipal: indent === 0,
          subtopicos: [],
          isSubtopico: indent > 0,
          lido: false,
        };

        if (tpcStack.length > 0) {
          tpcStack[tpcStack.length - 1].subtopicos.push(tpc);
        } else {
          tpcList.push(tpc);
        }

        tpcStack.push(tpc);
      } else {
        const nomeTopico = trimmedLinha;
        const tpc = {
          nome: nomeTopico,
          isPrincipal: true,
          subtopicos: [],
          isSubtopico: false,
        };
        tpcList.push(tpc);
        tpcStack = [tpc];
      }
    }

    const novaMateria = {
      nome: materia,
      topicos: tpcList,
      userId: userId,
    };

    if (isEditing && editingMateria) {
      const updatedMaterias = materias.map((m, index) =>
        index === materias.indexOf(editingMateria)
          ? { nome: materia, topicos: tpcList }
          : m
      );

      setMaterias(updatedMaterias);
      setMateria("");
      setTopicos("");
      setEditingMateria(null);
      setIsEditing(false);
    } else {
      // Adiciona a nova matéria ao Firebase
      const materiasCollection = collection(db, "materias");
      const docRef = await addDoc(materiasCollection, novaMateria);
      const newMateria = { id: docRef.id, ...novaMateria };

      setMaterias([...materias, newMateria]);
      setMateria("");
      setTopicos("");
    }
  };
  const handleEdit = (materia) => {
    setEditingMateria({ ...materia, userId }); // Mantenha o userId durante a edição
    setMateria(materia.nome);

    const topicosText = materia.topicos
      .map((topico) => {
        // Preserva os tópicos lidos como parte do texto
        const prefixo = topico.isSubtopico ? "- " : "";
        const sufixo = topico.lido ? " (lido)" : "";
        return `${prefixo}${topico.nome}${sufixo}`;
      })
      .join("\n");

    setTopicos(topicosText);
    setIsEditing(true);
  };

  const handleSalvarEdicao = async () => {
    if (editingMateria) {
      // Separa os tópicos por linha e remove espaços em branco
      const topicosArray = topicos.split("\n").map((linha) => linha.trim());

      // Inicializa uma nova lista de tópicos vazia
      const tpcList = [];
      let tpcStack = [];

      // Percorre cada linha de texto dos tópicos
      for (const linha of topicosArray) {
        // Remove o sufixo "(lido)" e verifica se estava presente
        const lido = linha.endsWith("(lido)");
        const nomeTopico = linha.replace(/\(lido\)$/, "").trim();

        // Determina a indentação baseada em hífens
        const match = nomeTopico.match(/^(-*)\s*(.*)/);
        const indent = match ? match[1].length : 0;
        const textoTopico = match ? match[2] : nomeTopico;

        // Garante que a pilha de tópicos tenha a indentação correta
        while (tpcStack.length > indent) {
          tpcStack.pop();
        }

        // Cria o objeto tópico com o estado de leitura preservado
        const tpc = {
          nome: textoTopico,
          isPrincipal: indent === 0,
          subtopicos: [],
          isSubtopico: indent > 0,
          lido, // Preserva o estado de leitura
        };

        // Adiciona o tópico ao nível correto de indentação
        if (tpcStack.length > 0) {
          tpcStack[tpcStack.length - 1].subtopicos.push(tpc);
        } else {
          tpcList.push(tpc);
        }

        // Atualiza a pilha de controle de indentação
        tpcStack.push(tpc);
      }

      // Aqui você salvaria tpcList no Firebase como antes, preservando o estado de lido/não lido
      const materiaDocRef = doc(db, "materias", editingMateria.id);
      await setDoc(materiaDocRef, {
        nome: materia,
        topicos: tpcList,
        userId: editingMateria.userId, // Mantenha o userId ao salvar as edições
      });

      // Atualiza o estado local
      setMaterias(
        materias.map((m) =>
          m.id === editingMateria.id
            ? {
                ...m,
                nome: materia,
                topicos: tpcList,
                userId: editingMateria.userId,
              }
            : m
        )
      );
      setMateria("");
      setTopicos("");
      setEditingMateria(null);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setMateria("");
    setTopicos("");
    setEditingMateria(null);
    setIsEditing(false);
  };

  const handleDelete = (materia) => {
    setSelectedMateria(materia);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (selectedMateria) {
      await deleteDoc(doc(db, "materias", selectedMateria.id));
      setMaterias(materias.filter((m) => m.id !== selectedMateria.id));
      setIsDeleteDialogOpen(false);
      setSelectedMateria(null); // Reseta a matéria selecionada
    }
  };

  const renderTopico = (topico, index, materiaIndex) => (
    <li key={index}>
      <div>
        {topico.nome.trim() === "" ? (
          <div
            style={{ marginBottom: "12px", borderBottom: "2px solid blue" }}
          ></div>
        ) : (
          <div
            className={
              checkedItems.some(
                (item) =>
                  item.materiaIndex === materiaIndex &&
                  item.topicoIndex === index
              )
                ? "read-topic"
                : ""
            }
          >
            <input
              type="checkbox"
              checked={checkedItems.some(
                (item) =>
                  item.materiaIndex === materiaIndex &&
                  item.topicoIndex === index
              )}
              onChange={() => handleCheck(index, materiaIndex)}
            />
            <span dangerouslySetInnerHTML={{ __html: topico.nome }}></span>
          </div>
        )}
      </div>
      {topico.subtopicos && topico.subtopicos.length > 0 && (
        <ul>
          {topico.subtopicos.map((subtopico, subIndex) =>
            renderTopico(subtopico, subIndex, materiaIndex)
          )}
        </ul>
      )}
    </li>
  );

  const carregarMaterias = async () => {
    if (!userId) {
      console.log("Usuário não autenticado");
      return;
    }

    try {
      const materiasCollection = collection(db, "materias");
      const q = query(materiasCollection, where("userId", "==", userId));
      const materiasSnapshot = await getDocs(q);
      const materiasData = materiasSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const initialCheckedItems = materiasData.reduce(
        (acc, materia, materiaIndex) => {
          const checkedTopics = (materia.topicos || []).reduce(
            (acc, topico, topicoIndex) => {
              if (topico.lido) {
                acc.push({ materiaIndex, topicoIndex });
              }
              return acc;
            },
            []
          );
          return acc.concat(checkedTopics);
        },
        []
      );

      setCheckedItems(initialCheckedItems);

      setMaterias(materiasData);
    } catch (error) {
      console.error("Erro ao carregar as matérias:", error.message);
    }
  };

  useEffect(() => {
    carregarMaterias();
  }, []);

  const calcularPercentualConclusao = (topicos) => {
    const topicosValidos = topicos.filter(
      (topico) => topico.nome.trim() !== ""
    ); // Ignora linhas em branco
    const totalTopicos = topicosValidos.length;
    const topicosConcluidos = topicosValidos.filter(
      (topico) => topico.lido
    ).length;
    return totalTopicos > 0 ? (topicosConcluidos / totalTopicos) * 100 : 0;
  };

  return (
    <div className="mb-4">
      <Card className=" mb-4 mt-4 mr-2 ml-2 ">
        <CardContent>
          <div className="ml-2 mr-2  text-foreground flex justify-center items-center">
            <h1 className=" text-center mt-6 text-3xl font-semibold mb-2 p-2 ">
              Meu Concurso dos Sonhos
            </h1>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  onClick={toggleDialog}
                  aria-label="Informações sobre o seu concurso"
                >
                  <InfoCircledIcon className="mt-6" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle className="text-2xl">
                  Informações sobre seu Concurso
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <p className=" text-justify text-sm ">
                    Preencha todas as matérias que serão estudadas no edital do
                    seu concurso e marque os tópicos já concluídos.
                  </p>
                  <p className="text-justify text-sm mb-6">
                    Para melhorar sua performance, acompanhe sua evolução e
                    otimize sua rotina de estudos
                  </p>
                </AlertDialogDescription>
                <AlertDialogCancel onClick={toggleDialog}>
                  Fechar
                </AlertDialogCancel>
              </AlertDialogContent>
            </AlertDialog>
          </div>{" "}
        </CardContent>
      </Card>
      <Card className=" mb-4 mt-4 mr-2 ml-2 ">
        <CardContent>
          {" "}
          <div className="p-4">
            <h2 className="text-xl font-semibold mb-4">
              Adicione as Matérias e Tópicos:
            </h2>
            <div className="mb-4">
              <label htmlFor="materia" className="text-sm">
                Nome da Matéria:
              </label>
              <Input
                id="materia"
                value={materia}
                onChange={(e) => setMateria(e.target.value)}
                placeholder="Digite o nome da matéria"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="topicos" className="text-sm">
                Tópicos:
              </label>
              <Textarea
                id="topicos"
                value={topicos}
                onChange={(e) => setTopicos(e.target.value)}
                placeholder="Cole seus tópicos aqui, um por linha. Salte uma linha caso queira dar espaço entre tópicos"
              />
            </div>
            {isEditing ? (
              <div>
                <Button
                  className="bg-primary px-4 py-2 rounded hover-bg-primary-dark"
                  onClick={handleSalvarEdicao}
                >
                  Salvar
                </Button>
                <Button
                  className="bg-danger bg-primary px-4 py-2 rounded hover-bg-danger-dark ml-4"
                  onClick={handleCancelEdit}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  className="bg-primary px-4 py-2 rounded hover-bg-primary-dark"
                  onClick={() => handleAdicionar()}
                >
                  Adicionar
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      {materias.map((materia, index) => (
        <div className="ml-3 mr-3" key={index}>
          <Card className=" mb-4 mt-4 mr-2 ml-2  hover:border-secondary-foreground/20">
            <CardContent>
              <Collapsible>
                <CollapsibleTrigger className="w-full rounded">
                  <div className="   flex rounded-2xl mb-2 items-center justify-between">
                    <h3 className=" text-lg  ml-3 flex justify-between w-full">
                      {materia.nome}
                      <span
                        style={{
                          fontSize: "1.1rem",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <button title="Percentual de tópicos concluídos">
                          <BarChartIcon style={{ marginRight: "8px" }} />
                        </button>
                        <div title="Percentual de tópicos concluídos">
                          {calcularPercentualConclusao(materia.topicos).toFixed(
                            0
                          )}
                        </div>
                        %
                      </span>
                    </h3>

                    <div className="flex items-center">
                      <button title="Editar Matéria e Tópico">
                        <Pencil1Icon
                          className="cursor-pointer ml-2 h-5 w-5"
                          onClick={() => handleEdit(materia)}
                        />
                      </button>
                      <button
                        title="Excluir Matéria e Tópico"
                        onClick={() => handleDelete(materia)}
                      >
                        <TrashIcon className="cursor-pointer ml-2 h-5 w-5 mr-2" />
                      </button>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className=" mb-4 mt-4 mr-2 ml-2 ">
                    <CardContent>
                      <ul className="text-lg">
                        {materia.topicos.map((topico, tIndex) =>
                          renderTopico(topico, tIndex, index)
                        )}
                      </ul>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </div>
      ))}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogTrigger asChild>
          <button style={{ display: "none" }}>Deletar</button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Excluir Matéria</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a matéria {selectedMateria?.nome}?
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
          <div className="flex justify-end gap-4">
            <Button onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmDelete}>Confirmar</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>{" "}
    </div>
  );
};

export default MeuConcurso;
